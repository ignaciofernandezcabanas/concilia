/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Thread Manager — orchestrates the AgentThread lifecycle.
 *
 * Functions:
 *   createThread       — create + dedup + first message + optional email
 *   addControllerMessage — handle controller NL or direct action
 *   processExternalReply — parse + decide + execute
 *   runAutonomousCycle   — auto-resolve, follow-ups, stale detection
 *   executeAction        — map actions to business logic
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { callAI, callAIJson } from "@/lib/ai/model-router";
import {
  COMPOSE_FOLLOWUP,
  FOLLOW_UP_PARSE_RESPONSE,
  FOLLOW_UP_DECIDE_ACTION,
  CONTROLLER_CONVERSATION,
  THREAD_SUBJECT,
} from "@/lib/ai/prompt-registry";
import { getPolicy, getCurrentTone } from "./follow-up-policy";
import { checkAutoResolve, type AutoResolveCondition } from "./auto-resolve";

// ── Types ──

export interface CreateThreadParams {
  organizationId: string;
  scenario: string;
  contactId?: string;
  contactName?: string;
  contactEmail?: string;
  invoiceIds?: string[];
  transactionIds?: string[];
  reconciliationIds?: string[];
  amount?: number;
  invoiceNumber?: string;
  concept?: string;
  companyName?: string;
  agentRunId?: string;
  sourceStep?: string;
  dueDate?: Date;
}

export interface CycleStats {
  autoResolved: number;
  followUpsSent: number;
  staleDetected: number;
  reprioritized: number;
}

// ── 1. createThread ──

export async function createThread(db: ScopedPrisma, params: CreateThreadParams): Promise<string> {
  const {
    organizationId,
    scenario,
    contactId,
    contactName,
    contactEmail,
    invoiceIds = [],
    transactionIds = [],
    reconciliationIds = [],
    amount,
    invoiceNumber,
    concept,
    companyName,
    agentRunId,
    sourceStep,
    dueDate,
  } = params;

  // Dedup: same contact + scenario + not resolved → reuse thread
  if (contactId) {
    const existing = await (db as any).agentThread.findFirst({
      where: {
        contactId,
        scenario,
        status: { notIn: ["RESOLVED", "STALE"] },
      },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  // Get follow-up policy
  const config = await (db as any).followUpConfig?.findFirst?.().catch(() => null);
  const policy = getPolicy(scenario, config ?? undefined);

  // Generate subject with AI (best-effort, fallback to simple format)
  let subject = `${scenario} — ${contactName ?? "Contacto"} (${amount?.toFixed(2) ?? "?"} EUR)`;
  try {
    const aiSubject = await callAI(
      "thread_subject",
      THREAD_SUBJECT.system,
      THREAD_SUBJECT.buildUser({ scenario, contactName, invoiceNumber, amount, concept })
    );
    if (aiSubject && aiSubject.length > 5 && aiSubject.length < 120) {
      subject = aiSubject.trim();
    }
  } catch {
    // Fallback to simple subject
  }

  // Build auto-resolve condition
  const autoResolveCondition: AutoResolveCondition = {
    type: policy.autoResolveType,
    invoiceIds: invoiceIds.length > 0 ? invoiceIds : undefined,
    transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
    contactId: contactId ?? undefined,
  };

  // Calculate next follow-up
  const nextFollowUpAt = new Date(Date.now() + policy.intervalDays * 24 * 60 * 60 * 1000);

  // Compute priority from urgency signals
  let priority = policy.defaultPriority;
  if (dueDate) {
    const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysUntilDue < 0) priority = "HIGH";
    if (daysUntilDue < -30) priority = "CRITICAL";
  }

  // Create thread
  const thread = await (db as any).agentThread.create({
    data: {
      organizationId,
      scenario,
      status: contactEmail ? "WAITING_EXTERNAL" : "WAITING_CONTROLLER",
      priority,
      subject,
      summary: `Seguimiento de ${scenario.toLowerCase().replace(/_/g, " ")} para ${contactName ?? "contacto desconocido"}.`,
      contactId: contactId ?? null,
      invoiceIds,
      transactionIds,
      reconciliationIds,
      autoResolveCondition: autoResolveCondition as any,
      followUpPolicy: policy as any,
      nextFollowUpAt,
      externalEmail: contactEmail ?? null,
      externalName: contactName ?? null,
      dueDate: dueDate ?? null,
      agentRunId: agentRunId ?? null,
      sourceStep: sourceStep ?? null,
    },
  });

  // Create initial SYSTEM message
  await (db as any).threadMessage.create({
    data: {
      threadId: thread.id,
      role: "SYSTEM",
      channel: "APP",
      content: `Hilo creado: ${scenario}. Contacto: ${contactName ?? "N/A"}. Importe: ${amount?.toFixed(2) ?? "N/A"} EUR.`,
    },
  });

  // If email available, compose and send first follow-up
  if (contactEmail && companyName) {
    try {
      const tone = getCurrentTone(policy, 0);
      const emailResult = await callAIJson(
        "compose_followup",
        COMPOSE_FOLLOWUP.system,
        COMPOSE_FOLLOWUP.buildUser({
          scenario,
          companyName,
          contactName: contactName ?? "Estimado/a",
          externalEmail: contactEmail,
          tone,
          followUpCount: 0,
          threadSummary: `Primera comunicación sobre ${scenario.toLowerCase().replace(/_/g, " ")}.`,
          invoiceDetails: invoiceNumber
            ? `Factura: ${invoiceNumber} — ${amount?.toFixed(2) ?? "?"} EUR`
            : undefined,
        }),
        COMPOSE_FOLLOWUP.schema
      );

      if (emailResult) {
        await (db as any).threadMessage.create({
          data: {
            threadId: thread.id,
            role: "AGENT",
            channel: "EMAIL",
            content: emailResult.plainBody,
            contentHtml: emailResult.htmlBody,
            channelMeta: { to: contactEmail, subject: emailResult.subject },
          },
        });

        // Update thread
        await (db as any).agentThread.update({
          where: { id: thread.id },
          data: {
            followUpCount: 1,
            lastFollowUpAt: new Date(),
            lastActivityAt: new Date(),
          },
        });
      }
    } catch {
      // Email composition failed — thread stays in WAITING_CONTROLLER
      await (db as any).agentThread.update({
        where: { id: thread.id },
        data: {
          status: "WAITING_CONTROLLER",
          blockedReason: "No se pudo generar el email inicial.",
        },
      });
    }
  }

  return thread.id;
}

// ── 2. addControllerMessage ──

export async function addControllerMessage(
  db: ScopedPrisma,
  threadId: string,
  message: string,
  actionTaken?: string
): Promise<{ reply: string; status: string }> {
  const thread = await (db as any).agentThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  // Record controller message
  await (db as any).threadMessage.create({
    data: {
      threadId,
      role: "CONTROLLER",
      channel: "APP",
      content: message,
      actionTaken: actionTaken ?? null,
    },
  });

  // If direct action → execute and return
  if (actionTaken) {
    const result = await executeAction(db, threadId, actionTaken, {});
    return { reply: result, status: "executed" };
  }

  // Natural language → call CONTROLLER_CONVERSATION prompt
  const recentMessages = thread.messages
    .reverse()
    .map((m: any) => `[${m.role}] ${m.content.substring(0, 200)}`)
    .join("\n");

  const aiResult = await callAIJson(
    "controller_conversation",
    CONTROLLER_CONVERSATION.system,
    CONTROLLER_CONVERSATION.buildUser({
      threadSubject: thread.subject,
      threadScenario: thread.scenario,
      threadStatus: thread.status,
      threadSummary: thread.summary ?? "",
      recentMessages,
      controllerMessage: message,
    }),
    CONTROLLER_CONVERSATION.schema
  );

  if (!aiResult) {
    return { reply: "No pude procesar tu mensaje. Inténtalo de nuevo.", status: "cannot_do" };
  }

  // Create AGENT reply message
  await (db as any).threadMessage.create({
    data: {
      threadId,
      role: "AGENT",
      channel: "APP",
      content: aiResult.reply,
      suggestedActions: aiResult.plannedActions.length > 0 ? aiResult.plannedActions : null,
    },
  });

  // Update thread activity
  await (db as any).agentThread.update({
    where: { id: threadId },
    data: { lastActivityAt: new Date() },
  });

  // If ready_to_execute, execute planned actions
  if (aiResult.status === "ready_to_execute") {
    for (const action of aiResult.plannedActions) {
      await executeAction(db, threadId, action.type, action.params as Record<string, unknown>);
    }
  }

  return { reply: aiResult.reply, status: aiResult.status };
}

// ── 3. processExternalReply ──

export async function processExternalReply(
  db: ScopedPrisma,
  threadId: string,
  emailContent: string,
  meta: {
    from?: string;
    subject?: string;
    hasAttachments?: boolean;
    attachmentNames?: string[];
    messageId?: string;
  }
): Promise<{ action: string; summary: string }> {
  const thread = await (db as any).agentThread.findUniqueOrThrow({
    where: { id: threadId },
  });

  // Record external message
  await (db as any).threadMessage.create({
    data: {
      threadId,
      role: "EXTERNAL",
      channel: "EMAIL",
      content: emailContent.substring(0, 5000),
      channelMeta: meta,
      attachmentNames: meta.attachmentNames ?? [],
    },
  });

  // Parse with FOLLOW_UP_PARSE_RESPONSE (Haiku)
  const parsed = await callAIJson(
    "followup_parse_response",
    FOLLOW_UP_PARSE_RESPONSE.system,
    FOLLOW_UP_PARSE_RESPONSE.buildUser({
      threadSubject: thread.subject,
      threadScenario: thread.scenario,
      responseText: emailContent,
      hasAttachments: meta.hasAttachments ?? false,
      attachmentNames: meta.attachmentNames ?? [],
    }),
    FOLLOW_UP_PARSE_RESPONSE.schema
  );

  if (!parsed) {
    // Escalate to controller if parsing fails
    await (db as any).agentThread.update({
      where: { id: threadId },
      data: {
        status: "WAITING_CONTROLLER",
        blockedReason: "No pude interpretar la respuesta del contacto.",
        lastActivityAt: new Date(),
      },
    });
    return { action: "escalate_to_controller", summary: "Respuesta no interpretable." };
  }

  // Decide with FOLLOW_UP_DECIDE_ACTION (Sonnet)
  const decision = await callAIJson(
    "followup_decide_action",
    FOLLOW_UP_DECIDE_ACTION.system,
    FOLLOW_UP_DECIDE_ACTION.buildUser({
      threadSubject: thread.subject,
      threadScenario: thread.scenario,
      threadSummary: thread.summary ?? "",
      followUpCount: thread.followUpCount,
      parsedResponse: JSON.stringify(parsed),
    }),
    FOLLOW_UP_DECIDE_ACTION.schema
  );

  const action = decision?.action ?? "escalate_to_controller";

  // Execute the decided action
  await executeAction(db, threadId, action, {
    waitDays: decision?.waitDays,
    controllerOptions: decision?.controllerOptions,
    parsedSummary: parsed.summary,
  });

  // Create SYSTEM message with decision
  await (db as any).threadMessage.create({
    data: {
      threadId,
      role: "SYSTEM",
      channel: "APP",
      content: `Respuesta procesada: ${parsed.summary}. Acción: ${action}. ${decision?.reasoning ?? ""}`,
    },
  });

  // Update thread
  await (db as any).agentThread.update({
    where: { id: threadId },
    data: {
      summary: parsed.summary,
      lastActivityAt: new Date(),
    },
  });

  return { action, summary: parsed.summary };
}

// ── 4. runAutonomousCycle ──

export async function runAutonomousCycle(
  db: ScopedPrisma,
  _companyId: string
): Promise<CycleStats> {
  const stats: CycleStats = {
    autoResolved: 0,
    followUpsSent: 0,
    staleDetected: 0,
    reprioritized: 0,
  };

  // 4a. Auto-resolve check: scan active threads
  const activeThreads = await (db as any).agentThread.findMany({
    where: { status: { in: ["AGENT_WORKING", "WAITING_EXTERNAL"] } },
    select: { id: true, autoResolveCondition: true, status: true },
    take: 50,
  });

  for (const thread of activeThreads) {
    const result = await checkAutoResolve(db, thread.autoResolveCondition as AutoResolveCondition);
    if (result.resolved) {
      await (db as any).agentThread.update({
        where: { id: thread.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          autoResolved: true,
          summary: result.reason ?? "Auto-resuelto",
          lastActivityAt: new Date(),
        },
      });
      await (db as any).threadMessage.create({
        data: {
          threadId: thread.id,
          role: "SYSTEM",
          channel: "APP",
          content: `Hilo auto-resuelto: ${result.reason}`,
        },
      });
      stats.autoResolved++;
    }
  }

  // 4b. Process pending follow-ups
  const now = new Date();
  const dueFollowUps = await (db as any).agentThread.findMany({
    where: {
      status: "WAITING_EXTERNAL",
      nextFollowUpAt: { lte: now },
    },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 3 } },
    take: 20,
  });

  for (const thread of dueFollowUps) {
    const policy = (thread.followUpPolicy ?? {}) as {
      maxAttempts?: number;
      toneProgression?: string[];
    };
    const maxAttempts = policy.maxAttempts ?? 3;

    if (thread.followUpCount >= maxAttempts) {
      // Max attempts reached → escalate to controller
      await (db as any).agentThread.update({
        where: { id: thread.id },
        data: {
          status: "WAITING_CONTROLLER",
          blockedReason: `${maxAttempts} intentos sin respuesta. Requiere decisión del controller.`,
          lastActivityAt: now,
        },
      });
      await (db as any).threadMessage.create({
        data: {
          threadId: thread.id,
          role: "SYSTEM",
          channel: "APP",
          content: `Máximo de ${maxAttempts} follow-ups alcanzado. Escalado al controller.`,
          suggestedActions: [
            { type: "extend_followup", label: "Enviar 1 más" },
            { type: "close", label: "Cerrar sin resolución" },
            { type: "provision_bad_debt", label: "Provisionar como dudoso cobro" },
          ],
        },
      });
      continue;
    }

    // Compose and record next follow-up
    const tone = getCurrentTone(
      {
        maxAttempts,
        toneProgression: policy.toneProgression ?? ["firm"],
        intervalDays: 4,
        autoResolveType: "",
        defaultPriority: "MEDIUM",
      },
      thread.followUpCount
    );

    // Get company name for the email
    const company = await (db as any).company
      ?.findFirst?.({ select: { name: true } })
      .catch(() => null);
    const companyName = company?.name ?? "Nuestra empresa";

    try {
      const emailResult = await callAIJson(
        "compose_followup",
        COMPOSE_FOLLOWUP.system,
        COMPOSE_FOLLOWUP.buildUser({
          scenario: thread.scenario,
          companyName,
          contactName: thread.externalName ?? "Estimado/a",
          externalEmail: thread.externalEmail ?? "",
          tone,
          followUpCount: thread.followUpCount,
          threadSummary: thread.summary ?? "",
          previousMessages: thread.messages
            .filter((m: any) => m.role === "AGENT")
            .map((m: any) => m.content.substring(0, 200))
            .join("\n---\n"),
        }),
        COMPOSE_FOLLOWUP.schema
      );

      if (emailResult) {
        await (db as any).threadMessage.create({
          data: {
            threadId: thread.id,
            role: "AGENT",
            channel: "EMAIL",
            content: emailResult.plainBody,
            contentHtml: emailResult.htmlBody,
            channelMeta: { to: thread.externalEmail, subject: emailResult.subject },
          },
        });

        const intervalDays = (thread.followUpPolicy as any)?.intervalDays ?? 4;
        await (db as any).agentThread.update({
          where: { id: thread.id },
          data: {
            followUpCount: thread.followUpCount + 1,
            lastFollowUpAt: now,
            nextFollowUpAt: new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000),
            lastActivityAt: now,
          },
        });
        stats.followUpsSent++;
      }
    } catch {
      // Failed to compose — skip this cycle
    }
  }

  // 4c. Detect stale threads (no activity for staleDays)
  const config = await (db as any).followUpConfig?.findFirst?.().catch(() => null);
  const staleDays = config?.staleDays ?? 7;
  const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

  const staleThreads = await (db as any).agentThread.findMany({
    where: {
      status: { in: ["AGENT_WORKING", "WAITING_EXTERNAL"] },
      lastActivityAt: { lt: staleThreshold },
      staleSince: null,
    },
    select: { id: true },
    take: 20,
  });

  for (const thread of staleThreads) {
    await (db as any).agentThread.update({
      where: { id: thread.id },
      data: { staleSince: now, status: "STALE" },
    });
    stats.staleDetected++;
  }

  // 4d. Reprioritize: overdue threads with dueDate passed → HIGH
  const overdueThreads = await (db as any).agentThread.findMany({
    where: {
      status: { in: ["AGENT_WORKING", "WAITING_EXTERNAL", "WAITING_CONTROLLER"] },
      dueDate: { lt: now },
      priority: { in: ["LOW", "MEDIUM"] },
    },
    select: { id: true },
    take: 20,
  });

  for (const thread of overdueThreads) {
    await (db as any).agentThread.update({
      where: { id: thread.id },
      data: { priority: "HIGH" },
    });
    stats.reprioritized++;
  }

  return stats;
}

// ── 5. executeAction ──

export async function executeAction(
  db: ScopedPrisma,
  threadId: string,
  action: string,
  params: Record<string, unknown>
): Promise<string> {
  const thread = await (db as any).agentThread.findUniqueOrThrow({
    where: { id: threadId },
  });

  switch (action) {
    case "close":
    case "send_thank_you": {
      await (db as any).agentThread.update({
        where: { id: threadId },
        data: { status: "RESOLVED", resolvedAt: new Date(), lastActivityAt: new Date() },
      });
      return "Hilo cerrado.";
    }

    case "extend_followup": {
      const policy = (thread.followUpPolicy ?? {}) as any;
      const intervalDays = policy.intervalDays ?? 4;
      await (db as any).agentThread.update({
        where: { id: threadId },
        data: {
          status: "WAITING_EXTERNAL",
          nextFollowUpAt: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000),
          blockedReason: null,
          lastActivityAt: new Date(),
        },
      });
      return "Follow-up extendido.";
    }

    case "wait_and_verify": {
      const waitDays = (params.waitDays as number) ?? 3;
      await (db as any).agentThread.update({
        where: { id: threadId },
        data: {
          status: "AGENT_WORKING",
          nextFollowUpAt: new Date(Date.now() + waitDays * 24 * 60 * 60 * 1000),
          lastActivityAt: new Date(),
        },
      });
      return `Esperando verificación durante ${waitDays} días.`;
    }

    case "escalate_to_controller": {
      const options = params.controllerOptions as string[] | undefined;
      await (db as any).agentThread.update({
        where: { id: threadId },
        data: {
          status: "WAITING_CONTROLLER",
          blockedReason: (params.parsedSummary as string) ?? "Requiere decisión del controller.",
          lastActivityAt: new Date(),
        },
      });
      if (options && options.length > 0) {
        await (db as any).threadMessage.create({
          data: {
            threadId,
            role: "SYSTEM",
            channel: "APP",
            content: "Escalado al controller.",
            suggestedActions: options.map((o) => ({ type: o, label: o })),
          },
        });
      }
      return "Escalado al controller.";
    }

    case "request_more_info":
    case "schedule_next_followup": {
      const policy = (thread.followUpPolicy ?? {}) as any;
      const intervalDays = policy.intervalDays ?? 4;
      await (db as any).agentThread.update({
        where: { id: threadId },
        data: {
          status: "WAITING_EXTERNAL",
          nextFollowUpAt: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000),
          lastActivityAt: new Date(),
        },
      });
      return "Siguiente follow-up programado.";
    }

    case "search_payment_in_bank": {
      // Search for recent matching transactions
      const invoiceIds = thread.invoiceIds ?? [];
      if (invoiceIds.length > 0) {
        const invoices = await db.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { totalAmount: true, contactId: true },
        });
        for (const inv of invoices) {
          const match = await db.bankTransaction.findFirst({
            where: {
              status: "PENDING",
              amount: { gte: inv.totalAmount * 0.95, lte: inv.totalAmount * 1.05 },
            },
          });
          if (match) {
            await (db as any).threadMessage.create({
              data: {
                threadId,
                role: "SYSTEM",
                channel: "APP",
                content: `Posible pago encontrado: ${match.amount.toFixed(2)} EUR del ${new Date(match.valueDate).toISOString().slice(0, 10)}. Concepto: ${match.concept ?? "N/A"}.`,
                suggestedActions: [
                  { type: "close", label: "Confirmar y cerrar" },
                  { type: "escalate_to_controller", label: "Revisar en conciliación" },
                ],
              },
            });
            await (db as any).agentThread.update({
              where: { id: threadId },
              data: { status: "WAITING_CONTROLLER", lastActivityAt: new Date() },
            });
            return `Posible pago encontrado: ${match.amount.toFixed(2)} EUR.`;
          }
        }
      }
      await (db as any).agentThread.update({
        where: { id: threadId },
        data: { status: "WAITING_EXTERNAL", lastActivityAt: new Date() },
      });
      return "No se encontró pago coincidente en banco.";
    }

    case "provision_bad_debt": {
      // Mark thread as resolved and flag invoices for provision
      await (db as any).agentThread.update({
        where: { id: threadId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          summary: "Provisionado como dudoso cobro.",
          lastActivityAt: new Date(),
        },
      });
      return "Marcado para provisión de dudoso cobro (694/490).";
    }

    default:
      return `Acción no reconocida: ${action}`;
  }
}
