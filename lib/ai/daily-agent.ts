/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
/**
 * Daily AI Agent Orchestrator.
 *
 * Runs 11 steps per organization, each in its own try/catch.
 * Creates an AgentRun record to track progress and metrics.
 */

import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: orchestrator creates scoped dbs per company
import { getScopedDb } from "@/lib/db-scoped";
import { runReconciliation } from "@/lib/reconciliation/engine";
import { runMonthlyDepreciation } from "@/lib/accounting/depreciation";
import { processRecurringAccruals } from "@/lib/accounting/accruals";
import { checkDeferredMatches } from "@/lib/accounting/deferred-entries";
import { detectIntercompany } from "@/lib/reconciliation/detectors/intercompany-detector";
import { generateForecast } from "@/lib/reports/forecast-generator";
import { checkCapitalAdequacy } from "@/lib/accounting/capital-adequacy";
import { callAI } from "@/lib/ai/model-router";
import { getCallBuffer, clearCallBuffer } from "@/lib/ai/model-router";
import {
  EXPLAIN_ANOMALY,
  TREASURY_ADVICE,
  DAILY_BRIEFING,
  CLOSE_PROPOSAL,
} from "@/lib/ai/prompt-registry";
import type { AgentRunStatus } from "@prisma/client";

// ── Types ──

export interface AgentRunSummary {
  runId: string;
  status: AgentRunStatus;
  companiesProcessed: number;
  txsProcessed: number;
  txsAutoExecuted: number;
  txsToBandeja: number;
  llmCallsTotal: number;
  errorsCount: number;
  stepErrors: string[];
  briefing: string | null;
}

interface StepResult {
  step: string;
  success: boolean;
  error?: string;
  metrics?: Record<string, number>;
}

// ── Constants ──

const MAX_LLM_CALLS_PER_COMPANY = 20;
const MAX_NOTIFICATIONS_PER_RUN = 20;

// ── Main ──

export async function runDailyAgent(organizationId: string): Promise<AgentRunSummary> {
  // Check if already run today
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const existingRun = await prisma.agentRun.findFirst({
    where: {
      organizationId,
      startedAt: { gte: startOfToday },
      status: { not: "FAILED" },
    },
  });

  if (existingRun) {
    return {
      runId: existingRun.id,
      status: "SKIPPED",
      companiesProcessed: 0,
      txsProcessed: 0,
      txsAutoExecuted: 0,
      txsToBandeja: 0,
      llmCallsTotal: 0,
      errorsCount: 0,
      stepErrors: [],
      briefing: null,
    };
  }

  // Create AgentRun record
  const run = await prisma.agentRun.create({
    data: { organizationId, status: "RUNNING" },
  });

  // Load org + companies
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: {
      companies: { select: { id: true, name: true, shortName: true } },
    },
  });

  // Clear call buffer for this run
  clearCallBuffer();

  const stepErrors: string[] = [];
  let totalTxsProcessed = 0;
  let totalAutoExecuted = 0;
  let totalToBandeja = 0;
  let notificationCount = 0;
  const companyResults: Record<string, StepResult[]> = {};

  // ══════════════════════════════════════
  // PER-COMPANY STEPS
  // ══════════════════════════════════════

  for (const company of org.companies) {
    const companyDb = getScopedDb(company.id);
    const results: StepResult[] = [];
    let llmCallsThisCompany = 0;

    // Step 1: Sync
    results.push(
      await runStep("sync", async () => {
        const integrations = await prisma.integration.findMany({
          where: { companyId: company.id, status: "CONNECTED" },
          select: { type: true },
        });
        // Sync is handled by existing endpoints — just log which integrations are active
        return { integrationsActive: integrations.length };
      })
    );

    // Step 2: Engine (reconciliation)
    results.push(
      await runStep("engine", async () => {
        const engineResult = await runReconciliation(companyDb, company.id);
        totalTxsProcessed += engineResult.processed;
        totalAutoExecuted += engineResult.autoApproved;
        totalToBandeja += engineResult.needsReview;
        return {
          processed: engineResult.processed,
          matched: engineResult.matched,
          autoApproved: engineResult.autoApproved,
          needsReview: engineResult.needsReview,
        };
      })
    );

    // Step 3: Auto entries (depreciation)
    results.push(
      await runStep("auto_entries", async () => {
        const now = new Date();
        const depResult = await runMonthlyDepreciation(
          companyDb,
          now.getFullYear(),
          now.getMonth() + 1
        );
        // Recurring accruals
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const accrualResult = await processRecurringAccruals(companyDb, lastDay);

        // Deferred entries (advances) — check for matching invoices
        const deferredMatches = await checkDeferredMatches(companyDb, company.id);

        return {
          assetsProcessed: depResult.assetsProcessed,
          entriesCreated: depResult.entriesCreated + accrualResult.entriesCreated,
          totalDepreciation: depResult.totalDepreciation,
          accrualsProcessed: accrualResult.accrualsProcessed,
          totalAccrued: accrualResult.totalAccrued,
          deferredMatches,
        };
      })
    );

    // Step 4: Intercompany detection
    results.push(
      await runStep("intercompany", async () => {
        const pendingTxs = await prisma.bankTransaction.findMany({
          where: {
            companyId: company.id,
            status: "PENDING",
            counterpartIban: { not: null },
            detectedType: null,
          },
          take: 50,
        });

        let detected = 0;
        for (const tx of pendingTxs) {
          const result = await detectIntercompany(tx, company.id);
          if (result.isIntercompany) {
            // Check for exact mirror (same amount, inverse sign, same date)
            const mirror = await prisma.bankTransaction.findFirst({
              where: {
                companyId: result.siblingCompanyId!,
                amount: -tx.amount,
                status: "PENDING",
                valueDate: tx.valueDate,
              },
            });

            await prisma.intercompanyLink.create({
              data: {
                amount: Math.abs(tx.amount),
                date: tx.valueDate,
                concept: tx.conceptParsed ?? tx.concept,
                status: mirror ? "CONFIRMED" : "DETECTED",
                companyAId: company.id,
                companyBId: result.siblingCompanyId!,
                transactionAId: tx.id,
                transactionBId: mirror?.id ?? null,
                matchedAt: mirror ? new Date() : null,
                organizationId,
              },
            });

            if (mirror) {
              await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { status: "RECONCILED", detectedType: "INTERCOMPANY" },
              });
              await prisma.bankTransaction.update({
                where: { id: mirror.id },
                data: { status: "RECONCILED", detectedType: "INTERCOMPANY" },
              });
            } else {
              await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { detectedType: "INTERCOMPANY", priority: "DECISION" },
              });
            }

            detected++;
          }
        }
        return { scanned: pendingTxs.length, detected };
      })
    );

    // Step 5: Provisions
    results.push(
      await runStep("provisions", async () => {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const overdueInvoices = await prisma.invoice.findMany({
          where: {
            companyId: company.id,
            type: "ISSUED",
            status: "OVERDUE",
            dueDate: { lt: ninetyDaysAgo },
            provisionType: null,
          },
          take: 20,
        });
        // Just flag for review — provisions are always PROPOSED
        return { overdueCount: overdueInvoices.length };
      })
    );

    // Step 6: Reminders (stub — email sending not implemented yet)
    results.push(
      await runStep("reminders", async () => {
        const overdueForReminder = await prisma.invoice.count({
          where: {
            companyId: company.id,
            type: "ISSUED",
            status: "OVERDUE",
          },
        });
        return { overdueForReminder };
      })
    );

    // Collect step errors
    for (const r of results) {
      if (!r.success && r.error) {
        stepErrors.push(`${company.shortName ?? company.name}/${r.step}: ${r.error}`);
      }
    }

    companyResults[company.id] = results;
  }

  // ══════════════════════════════════════
  // GROUP-LEVEL STEPS
  // ══════════════════════════════════════

  // Step 7: Treasury forecast
  let forecastJson = "{}";
  const step7 = await runStep("treasury", async () => {
    const firstCompanyId = org.companies[0]?.id;
    if (!firstCompanyId) return { skipped: true };

    const forecast = await generateForecast(getScopedDb(firstCompanyId), 8);
    forecastJson = JSON.stringify(
      forecast.weeks.slice(0, 4).map((w) => ({
        week: w.weekStart,
        balance: w.projectedBalance,
      }))
    );

    // Check for low balance weeks
    const lowWeeks = forecast.weeks.filter((w) => w.projectedBalance < 0);
    if (lowWeeks.length > 0 && notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
      const advice = await callAI(
        "treasury_advice",
        TREASURY_ADVICE.system,
        TREASURY_ADVICE.buildUser({
          currentBalance: forecast.currentBalance,
          projectedLow: Math.min(...forecast.weeks.map((w) => w.projectedBalance)),
          weekLabel: lowWeeks[0].weekStart,
          details: JSON.stringify(lowWeeks.slice(0, 3)),
        })
      );

      if (advice) {
        const adminUsers = await getOrgAdminUsers(organizationId);
        for (const userId of adminUsers.slice(0, 3)) {
          await createNotification(
            org.companies[0].id,
            userId,
            "TREASURY_ALERT",
            "Alerta de tesorería",
            advice
          );
          notificationCount++;
        }
      }
    }

    return { weeksForecasted: forecast.weeks.length, lowBalanceWeeks: lowWeeks.length };
  });
  if (!step7.success && step7.error) stepErrors.push(`group/treasury: ${step7.error}`);

  // Step 8: Anomalies
  let anomaliesJson = "[]";
  const step8 = await runStep("anomalies", async () => {
    const anomalies: Array<{
      company: string;
      account: string;
      zScore: number;
      explanation?: string;
    }> = [];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    for (const company of org.companies) {
      if (anomalies.length >= 5) break;

      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Get classified txs by account for current month
      const currentTxs = await prisma.bankTransaction.findMany({
        where: {
          companyId: company.id,
          status: "CLASSIFIED",
          valueDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
        include: {
          classification: { include: { account: { select: { code: true, name: true } } } },
        },
      });

      // Group by account
      const currentByAccount = new Map<
        string,
        { total: number; name: string; topConcept: string }
      >();
      for (const tx of currentTxs) {
        if (!tx.classification?.account) continue;
        const code = tx.classification.account.code;
        const existing = currentByAccount.get(code);
        const abs = Math.abs(tx.amount);
        if (existing) {
          existing.total += abs;
          if (abs > Math.abs(parseFloat(existing.topConcept.split("|")[0] || "0"))) {
            existing.topConcept = `${abs}|${tx.concept ?? ""}`;
          }
        } else {
          currentByAccount.set(code, {
            total: abs,
            name: tx.classification.account.name,
            topConcept: `${abs}|${tx.concept ?? ""}`,
          });
        }
      }

      // Get historical averages (last 6 months)
      const historicalTxs = await prisma.bankTransaction.findMany({
        where: {
          companyId: company.id,
          status: "CLASSIFIED",
          valueDate: { gte: sixMonthsAgo, lt: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
        include: { classification: { include: { account: { select: { code: true } } } } },
      });

      const historicalByAccount = new Map<string, number[]>();
      for (const tx of historicalTxs) {
        if (!tx.classification?.account) continue;
        const code = tx.classification.account.code;
        const month = `${tx.valueDate.getFullYear()}-${String(tx.valueDate.getMonth() + 1).padStart(2, "0")}`;
        // Group by month first, then avg
        const key = `${code}:${month}`;
        if (!historicalByAccount.has(code)) historicalByAccount.set(code, []);
        // Simplified: just accumulate amounts
      }

      // Simplified z-score calculation
      for (const [code, current] of Array.from(currentByAccount)) {
        const histAmounts = historicalTxs
          .filter((tx) => tx.classification?.account?.code === code)
          .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

        const histMonths = 6;
        const avg = histAmounts / histMonths;
        if (avg < 100) continue; // Skip small accounts

        const stdDev = avg * 0.3; // Simplified
        if (stdDev === 0) continue;

        const zScore = (current.total - avg) / stdDev;

        if (Math.abs(zScore) > 2 && anomalies.length < 5) {
          let explanation: string | undefined;
          const callResult = await callAI(
            "explain_anomaly",
            EXPLAIN_ANOMALY.system,
            EXPLAIN_ANOMALY.buildUser({
              accountCode: code,
              accountName: current.name,
              currentAmount: current.total,
              avgAmount: avg,
              zScore,
              topTx: current.topConcept.split("|")[1] ?? "",
            })
          );
          explanation = callResult ?? undefined;

          anomalies.push({
            company: company.shortName ?? company.name,
            account: `${code} ${current.name}`,
            zScore: Math.round(zScore * 10) / 10,
            explanation,
          });

          if (notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
            const adminUsers = await getOrgAdminUsers(organizationId);
            for (const userId of adminUsers.slice(0, 2)) {
              await createNotification(
                company.id,
                userId,
                "ANOMALY_DETECTED",
                `Anomalía: ${code} ${current.name}`,
                explanation ??
                  `Gasto ${zScore > 0 ? "superior" : "inferior"} a la media en ${code}.`
              );
              notificationCount++;
            }
          }
        }
      }
    }

    anomaliesJson = JSON.stringify(anomalies);
    return { anomaliesDetected: anomalies.length };
  });
  if (!step8.success && step8.error) stepErrors.push(`group/anomalies: ${step8.error}`);

  // Step 9: Fiscal deadlines
  const step9 = await runStep("fiscal", async () => {
    const now = new Date();
    const fifteenDaysOut = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const currentMonth = now.getMonth() + 1;
    const currentQuarter = Math.ceil(currentMonth / 3);

    // Spanish fiscal calendar: 303 (quarterly VAT) due 20th of month after quarter end
    const quarterEndMonths = [3, 6, 9, 12];
    const deadlines: Array<{ model: string; dueDate: string; description: string }> = [];

    for (const qm of quarterEndMonths) {
      const dueMonth = qm + 1 > 12 ? 1 : qm + 1;
      const dueYear = qm + 1 > 12 ? now.getFullYear() + 1 : now.getFullYear();
      const dueDate = new Date(dueYear, dueMonth - 1, 20);

      if (dueDate >= now && dueDate <= fifteenDaysOut) {
        deadlines.push({
          model: "303",
          dueDate: dueDate.toISOString().slice(0, 10),
          description: `Modelo 303 — IVA trimestral (T${Math.ceil(qm / 3)})`,
        });
      }
    }

    // 111 (withholdings) due 20th of month after quarter end
    for (const qm of quarterEndMonths) {
      const dueMonth = qm + 1 > 12 ? 1 : qm + 1;
      const dueYear = qm + 1 > 12 ? now.getFullYear() + 1 : now.getFullYear();
      const dueDate = new Date(dueYear, dueMonth - 1, 20);

      if (dueDate >= now && dueDate <= fifteenDaysOut) {
        deadlines.push({
          model: "111",
          dueDate: dueDate.toISOString().slice(0, 10),
          description: `Modelo 111 — Retenciones IRPF (T${Math.ceil(qm / 3)})`,
        });
      }
    }

    if (deadlines.length > 0 && notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
      const adminUsers = await getOrgAdminUsers(organizationId);
      for (const dl of deadlines) {
        for (const userId of adminUsers.slice(0, 2)) {
          await createNotification(
            org.companies[0]?.id ?? "",
            userId,
            "FISCAL_DEADLINE",
            `Vencimiento fiscal: ${dl.model}`,
            `${dl.description} — vence el ${dl.dueDate}`
          );
          notificationCount++;
        }
      }
    }

    return { deadlinesDetected: deadlines.length };
  });
  if (!step9.success && step9.error) stepErrors.push(`group/fiscal: ${step9.error}`);

  // Step 10: Close proposal (only days 1-3)
  let closeProposalText: string | null = null;
  const dayOfMonth = new Date().getDate();
  const step10 = await runStep("close_proposal", async () => {
    if (dayOfMonth > 3) return { skipped: true };

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const monthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

    // Gather checklist data
    const pendingEntries = await prisma.journalEntry.count({
      where: {
        companyId: { in: org.companies.map((c) => c.id) },
        status: "DRAFT",
      },
    });

    const pendingInterco = await prisma.intercompanyLink.count({
      where: {
        organizationId,
        status: "DETECTED",
      },
    });

    const checklistJson = JSON.stringify({
      companies: org.companies.map((c) => c.shortName ?? c.name),
      pendingJournalEntries: pendingEntries,
      pendingIntercompany: pendingInterco,
      month: monthStr,
    });

    closeProposalText = await callAI(
      "close_proposal",
      CLOSE_PROPOSAL.system,
      CLOSE_PROPOSAL.buildUser({ orgName: org.name, month: monthStr, checklistJson })
    );

    if (closeProposalText && notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
      const adminUsers = await getOrgAdminUsers(organizationId);
      for (const userId of adminUsers.slice(0, 3)) {
        await createNotification(
          org.companies[0]?.id ?? "",
          userId,
          "CLOSE_PROPOSAL",
          `Propuesta de cierre: ${monthStr}`,
          closeProposalText.slice(0, 500)
        );
        notificationCount++;
      }
    }

    return { generated: !!closeProposalText };
  });
  if (!step10.success && step10.error) stepErrors.push(`group/close_proposal: ${step10.error}`);

  // Step 10b: Capital adequacy check (per company)
  const step10b = await runStep("capital_adequacy", async () => {
    let alertsCreated = 0;
    for (const company of org.companies) {
      const companyDb = getScopedDb(company.id);
      const adequacy = await checkCapitalAdequacy(companyDb);
      for (const alert of adequacy.alerts) {
        if (alert.level === "CRITICAL" || alert.level === "MEDIUM") {
          if (notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
            const adminUsers = await getOrgAdminUsers(organizationId);
            for (const userId of adminUsers.slice(0, 3)) {
              await createNotification(
                company.id,
                userId,
                "FINANCIAL_ALERT",
                alert.level === "CRITICAL"
                  ? "Causa de disolución: PN < 50% capital (art. 363 LSC)"
                  : "Adecuación de capital: PN por debajo del capital social",
                `${company.shortName ?? company.name}: ${alert.message}`
              );
              notificationCount++;
              alertsCreated++;
            }
          }
        }
      }

      // Regularization suggestion: if close_proposal is active (days 1-3)
      // and result account 129 has balance, suggest regularization
      if (dayOfMonth <= 3 && adequacy.patrimonioNeto > 0) {
        // Check if 129 has balance (result pending distribution)
        const pendingDividends = await (companyDb as any).supportingDocument?.findFirst?.({
          where: {
            type: "ACTA_JUNTA",
            status: "PENDING_APPROVAL",
            description: { contains: "dividendo" },
          },
        });

        if (pendingDividends && notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
          const adminUsers = await getOrgAdminUsers(organizationId);
          for (const userId of adminUsers.slice(0, 2)) {
            await createNotification(
              company.id,
              userId,
              "FINANCIAL_ALERT",
              "Dividendos pendientes de aprobación",
              `${company.shortName ?? company.name}: Existe una propuesta de reparto de dividendos pendiente de aprobación.`
            );
            notificationCount++;
            alertsCreated++;
          }
        }
      }
    }
    return { alertsCreated };
  });
  if (!step10b.success && step10b.error)
    stepErrors.push(`group/capital_adequacy: ${step10b.error}`);

  // Step 10c: Debt monitoring (5 sub-steps)
  const step10c = await runStep("debt_monitoring", async () => {
    let overdueCount = 0;
    let maturityAlerts = 0;
    let covenantBreaches = 0;
    let creditLineAlerts = 0;
    let accrualsCreated = 0;

    for (const company of org.companies) {
      const companyDb = getScopedDb(company.id);

      // Sub-step 1: Check overdue installments (>3 days past due)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const overdueEntries =
        (await (companyDb as any).debtScheduleEntry
          ?.findMany?.({
            where: {
              matched: false,
              dueDate: { lt: threeDaysAgo },
            },
            include: { debtInstrument: { select: { name: true, id: true } } },
            take: 20,
          })
          .catch(() => [])) ?? [];

      for (const entry of overdueEntries) {
        overdueCount++;
        if (notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
          const adminUsers = await getOrgAdminUsers(organizationId);
          for (const userId of adminUsers.slice(0, 2)) {
            await createNotification(
              company.id,
              userId,
              "DEBT_INSTALLMENT_OVERDUE",
              `Cuota vencida: ${entry.debtInstrument?.name ?? "Préstamo"}`,
              `Cuota #${entry.entryNumber} de ${entry.totalAmount.toFixed(2)}€ venció el ${new Date(entry.dueDate).toISOString().slice(0, 10)}.`
            );
            notificationCount++;
          }
        }
      }

      // Sub-step 2: Check debt maturities (90/30/7 days)
      const instruments =
        (await (companyDb as any).debtInstrument
          ?.findMany?.({
            where: { status: "ACTIVE" },
            select: {
              id: true,
              name: true,
              maturityDate: true,
              type: true,
              outstandingBalance: true,
            },
          })
          .catch(() => [])) ?? [];

      const now = new Date();
      for (const inst of instruments) {
        const maturity = new Date(inst.maturityDate);
        const daysToMaturity = Math.floor(
          (maturity.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        if (
          daysToMaturity <= 90 &&
          daysToMaturity > 0 &&
          notificationCount < MAX_NOTIFICATIONS_PER_RUN
        ) {
          maturityAlerts++;
          const urgency =
            daysToMaturity <= 7 ? "URGENTE" : daysToMaturity <= 30 ? "Próximo" : "A 90 días";
          const adminUsers = await getOrgAdminUsers(organizationId);
          for (const userId of adminUsers.slice(0, 2)) {
            await createNotification(
              company.id,
              userId,
              "DEBT_MATURITY_APPROACHING",
              `${urgency}: Vencimiento ${inst.name}`,
              `${inst.name} (${inst.type}) vence el ${maturity.toISOString().slice(0, 10)}. Saldo pendiente: ${inst.outstandingBalance?.toFixed(2) ?? "0.00"}€.`
            );
            notificationCount++;
          }
        }
      }

      // Sub-step 3: Check covenant compliance
      const covenants =
        (await (companyDb as any).debtCovenant
          ?.findMany?.({
            where: { isCompliant: false },
            include: { debtInstrument: { select: { name: true } } },
          })
          .catch(() => [])) ?? [];

      for (const cov of covenants) {
        covenantBreaches++;
        if (notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
          const adminUsers = await getOrgAdminUsers(organizationId);
          for (const userId of adminUsers.slice(0, 2)) {
            await createNotification(
              company.id,
              userId,
              "DEBT_COVENANT_BREACHED",
              `Covenant incumplido: ${cov.name}`,
              `${cov.debtInstrument?.name ?? "Instrumento"}: ${cov.metric} ${cov.operator} ${cov.threshold}. Último valor: ${cov.lastTestedValue?.toFixed(2) ?? "N/A"}.`
            );
            notificationCount++;
          }
        }
      }

      // Sub-step 4: Check credit line availability (<20%)
      const creditLines =
        (await (companyDb as any).debtInstrument
          ?.findMany?.({
            where: {
              status: "ACTIVE",
              type: { in: ["REVOLVING_CREDIT", "OVERDRAFT", "DISCOUNT_LINE"] },
            },
            select: { id: true, name: true, creditLimit: true, currentDrawdown: true },
          })
          .catch(() => [])) ?? [];

      for (const cl of creditLines) {
        const limit = cl.creditLimit ?? 0;
        const drawn = cl.currentDrawdown ?? 0;
        const available = limit - drawn;
        if (limit > 0 && available / limit < 0.2 && notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
          creditLineAlerts++;
          const adminUsers = await getOrgAdminUsers(organizationId);
          for (const userId of adminUsers.slice(0, 2)) {
            await createNotification(
              company.id,
              userId,
              "CREDIT_LINE_LOW_AVAILABLE",
              `Línea crédito baja: ${cl.name}`,
              `Disponible: ${available.toFixed(2)}€ de ${limit.toFixed(2)}€ (${((available / limit) * 100).toFixed(0)}%).`
            );
            notificationCount++;
          }
        }
      }

      // Sub-step 5: Generate interest accruals for revolving lines (monthly periodification)
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const isMonthEnd = now.getDate() === lastDayOfMonth.getDate();
      if (isMonthEnd) {
        for (const cl of creditLines) {
          const drawn = cl.currentDrawdown ?? 0;
          if (drawn <= 0) continue;

          // Get rate from full instrument data
          const fullInst = instruments.find((i: any) => i.id === cl.id);
          if (!fullInst) continue;

          // Simple monthly interest accrual (not creating actual entries here — just counting)
          accrualsCreated++;
        }
      }
    }

    return { overdueCount, maturityAlerts, covenantBreaches, creditLineAlerts, accrualsCreated };
  });
  if (!step10c.success && step10c.error) stepErrors.push(`group/debt_monitoring: ${step10c.error}`);

  // Step 11: Daily briefing
  let briefingText: string | null = null;
  const step11 = await runStep("briefing", async () => {
    const bandejaCount = await prisma.bankTransaction.count({
      where: {
        companyId: { in: org.companies.map((c) => c.id) },
        status: "PENDING",
      },
    });

    briefingText = await callAI(
      "daily_briefing",
      DAILY_BRIEFING.system,
      DAILY_BRIEFING.buildUser({
        orgName: org.name,
        metricsJson: JSON.stringify({
          companiesProcessed: org.companies.length,
          txsProcessed: totalTxsProcessed,
          txsAutoExecuted: totalAutoExecuted,
          txsToBandeja: totalToBandeja,
          errors: stepErrors.length,
        }),
        forecastJson,
        anomaliesJson,
        bandejaCount,
        fiscalJson: "{}",
      })
    );

    if (briefingText && notificationCount < MAX_NOTIFICATIONS_PER_RUN) {
      const adminUsers = await getOrgAdminUsers(organizationId);
      for (const userId of adminUsers.slice(0, 3)) {
        await createNotification(
          org.companies[0]?.id ?? "",
          userId,
          "DAILY_BRIEFING",
          "Briefing diario",
          briefingText.slice(0, 500)
        );
        notificationCount++;
      }
    }

    return { generated: !!briefingText };
  });
  if (!step11.success && step11.error) stepErrors.push(`group/briefing: ${step11.error}`);

  // ══════════════════════════════════════
  // FINALIZE
  // ══════════════════════════════════════

  const aiCallLog = getCallBuffer().map((r) => ({
    task: r.task,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    latencyMs: r.latencyMs,
    success: r.success,
  }));

  const llmCallsTotal = aiCallLog.length;
  const llmCostEstimate = aiCallLog.reduce((sum, r) => {
    // Rough cost estimate per 1K tokens
    const inputCost = r.model.includes("haiku")
      ? 0.001
      : r.model.includes("sonnet")
        ? 0.003
        : 0.015;
    const outputCost = r.model.includes("haiku")
      ? 0.005
      : r.model.includes("sonnet")
        ? 0.015
        : 0.075;
    return sum + (r.inputTokens / 1000) * inputCost + (r.outputTokens / 1000) * outputCost;
  }, 0);

  const finalStatus: AgentRunStatus = stepErrors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      companiesProcessed: org.companies.length,
      txsProcessed: totalTxsProcessed,
      txsAutoExecuted: totalAutoExecuted,
      txsToBandeja: totalToBandeja,
      llmCallsTotal,
      llmCostEstimate: Math.round(llmCostEstimate * 10000) / 10000,
      errorsCount: stepErrors.length,
      companyResults: JSON.parse(
        JSON.stringify(companyResults)
      ) as import("@prisma/client").Prisma.InputJsonValue,
      aiCallLog: aiCallLog as unknown as import("@prisma/client").Prisma.InputJsonValue,
      briefing: briefingText,
    },
  });

  return {
    runId: run.id,
    status: finalStatus,
    companiesProcessed: org.companies.length,
    txsProcessed: totalTxsProcessed,
    txsAutoExecuted: totalAutoExecuted,
    txsToBandeja: totalToBandeja,
    llmCallsTotal,
    errorsCount: stepErrors.length,
    stepErrors,
    briefing: briefingText,
  };
}

// ── Helpers ──

async function runStep(
  name: string,
  fn: () => Promise<Record<string, unknown>>
): Promise<StepResult> {
  try {
    const metrics = await fn();
    return { step: name, success: true, metrics: metrics as Record<string, number> };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[daily-agent] Step ${name} failed:`, error);
    return { step: name, success: false, error };
  }
}

async function getOrgAdminUsers(organizationId: string): Promise<string[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { userId: true },
  });
  return memberships.map((m) => m.userId);
}

async function createNotification(
  companyId: string,
  userId: string,
  type: string,
  title: string,
  body: string
): Promise<void> {
  await prisma.notification
    .create({
      data: {
        type: type as import("@prisma/client").NotificationType,
        title,
        body,
        userId,
        companyId,
      },
    })
    .catch((err) =>
      console.warn("[daily-agent] Notification failed:", err instanceof Error ? err.message : err)
    );
}
