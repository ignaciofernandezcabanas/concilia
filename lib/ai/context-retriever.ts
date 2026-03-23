/**
 * Context Retriever.
 *
 * Fetches relevant historical controller decisions for a transaction
 * to inject into LLM prompts. This makes the LLM aware of HOW this
 * specific controller classifies similar transactions.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import Fuse from "fuse.js";

// ── Types ──

export interface HistoricalDecision {
  date: string;
  concept: string;
  amount: number;
  systemProposal: string;
  controllerAction: string;
  wasModified: boolean;
  accountCode?: string;
}

export interface RetrievedContext {
  sameCounterpart: HistoricalDecision[];
  similarConcept: HistoricalDecision[];
  activePatterns: Array<{
    predictedAction: string;
    predictedAccount?: string;
    confidence: number;
    occurrences: number;
  }>;
  totalFound: number;
}

// ── Main function ──

export async function getRelevantContext(
  tx: {
    counterpartIban: string | null;
    counterpartName: string | null;
    concept: string | null;
    amount: number;
  },
  db: ScopedPrisma,
  maxResults: number = 10
): Promise<RetrievedContext> {
  const [sameCounterpart, conceptCandidates, activePatterns] = await Promise.all([
    // Query 1: Same IBAN
    tx.counterpartIban
      ? db.controllerDecision.findMany({
          where: {
            counterpartIban: tx.counterpartIban,
            isDefinitive: true,
          },
          orderBy: { createdAt: "desc" },
          take: maxResults,
          select: {
            createdAt: true,
            bankConcept: true,
            controllerAction: true,
            systemProposal: true,
            wasModified: true,
            amountRange: true,
          },
        })
      : Promise.resolve([]),

    // Query 2: Similar concept (load candidates for Fuse.js)
    tx.concept
      ? db.controllerDecision.findMany({
          where: {
            transactionType: tx.amount > 0 ? "cobro" : "pago",
            bankConcept: { not: null },
            isDefinitive: true,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            createdAt: true,
            bankConcept: true,
            controllerAction: true,
            systemProposal: true,
            wasModified: true,
            amountRange: true,
          },
        })
      : Promise.resolve([]),

    // Query 3: Learned patterns
    db.learnedPattern.findMany({
      where: {
        isActive: true,
        status: { in: ["ACTIVE_SUPERVISED", "PROMOTED"] },
        OR: [
          ...(tx.counterpartIban ? [{ counterpartIban: tx.counterpartIban }] : []),
          ...(tx.counterpartName ? [{ counterpartName: { contains: tx.counterpartName, mode: "insensitive" as const } }] : []),
        ].length > 0
          ? [
              ...(tx.counterpartIban ? [{ counterpartIban: tx.counterpartIban }] : []),
              ...(tx.counterpartName ? [{ counterpartName: { contains: tx.counterpartName, mode: "insensitive" as const } }] : []),
            ]
          : [{ id: "__never_match__" }], // no IBAN or name → skip
      },
      take: 5,
      select: {
        predictedAction: true,
        predictedAccount: true,
        confidence: true,
        occurrences: true,
      },
    }),
  ]);

  // Map counterpart decisions
  const sameCounterpartDecisions: HistoricalDecision[] = sameCounterpart.map((d) => ({
    date: d.createdAt.toISOString().slice(0, 10),
    concept: d.bankConcept ?? "",
    amount: 0,
    systemProposal: d.systemProposal,
    controllerAction: d.controllerAction,
    wasModified: d.wasModified,
    accountCode: extractAccountCode(d.controllerAction),
  }));

  // Fuzzy match on concept
  let similarConceptDecisions: HistoricalDecision[] = [];
  if (tx.concept && conceptCandidates.length > 0) {
    const fuse = new Fuse(
      conceptCandidates.map((d, i) => ({ idx: i, text: d.bankConcept! })),
      { keys: ["text"], threshold: 0.5 }
    );
    const matches = fuse.search(tx.concept).slice(0, 5);
    similarConceptDecisions = matches.map((m) => {
      const d = conceptCandidates[m.item.idx];
      return {
        date: d.createdAt.toISOString().slice(0, 10),
        concept: d.bankConcept ?? "",
        amount: 0,
        systemProposal: d.systemProposal,
        controllerAction: d.controllerAction,
        wasModified: d.wasModified,
        accountCode: extractAccountCode(d.controllerAction),
      };
    });
  }

  const patterns = activePatterns.map((p) => ({
    predictedAction: p.predictedAction,
    predictedAccount: p.predictedAccount ?? undefined,
    confidence: p.confidence,
    occurrences: p.occurrences,
  }));

  const totalFound = sameCounterpartDecisions.length + similarConceptDecisions.length + patterns.length;

  return {
    sameCounterpart: sameCounterpartDecisions,
    similarConcept: similarConceptDecisions,
    activePatterns: patterns,
    totalFound,
  };
}

// ── Format for prompt ──

export function formatContextForPrompt(context: RetrievedContext): string {
  if (context.totalFound === 0) return "";

  const parts: string[] = ["<controller_decisions>", "Decisiones previas del controller para transacciones similares:"];

  if (context.sameCounterpart.length > 0) {
    parts.push("\nMismo proveedor/cliente (IBAN):");
    for (const d of context.sameCounterpart) {
      const action = d.wasModified
        ? `propuesta: ${d.systemProposal} → controller: ${d.controllerAction}`
        : `propuesta: ${d.systemProposal} → aprobado sin cambios`;
      parts.push(`- ${d.date} | "${d.concept}" | ${action}`);
    }
  }

  if (context.similarConcept.length > 0) {
    parts.push("\nConcepto similar:");
    for (const d of context.similarConcept) {
      const action = d.wasModified
        ? `propuesta: ${d.systemProposal} → controller: ${d.controllerAction}`
        : `propuesta: ${d.systemProposal} → aprobado`;
      parts.push(`- "${d.concept}" | ${action}`);
    }
  }

  if (context.activePatterns.length > 0) {
    parts.push("\nPatrones aprendidos:");
    for (const p of context.activePatterns) {
      const account = p.predictedAccount ? ` (${p.predictedAccount})` : "";
      parts.push(`- ${p.predictedAction}${account} | confianza ${Math.round(p.confidence * 100)}% | ${p.occurrences} ocurrencias`);
    }
  }

  parts.push("</controller_decisions>");
  return parts.join("\n");
}

// ── Helpers ──

function extractAccountCode(action: string): string | undefined {
  // Extract from "classify:629" or "classify_as:629"
  const match = action.match(/classif\w*:(\d{3,})/);
  return match?.[1];
}
