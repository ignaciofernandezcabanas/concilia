import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";

/**
 * GET /api/settings/rules/suggestions
 *
 * Returns proactive rule suggestions based on repeated similar resolutions.
 * Triggers when the controller has resolved 3+ similar transactions the same way.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const { company } = ctx;

  // Find patterns in definitive decisions: same counterpartIban + same action, 3+ times
  const patterns = await prisma.controllerDecision.groupBy({
    by: ["counterpartIban", "controllerAction", "transactionType"],
    where: {
      companyId: company.id,
      isDefinitive: true,
      counterpartIban: { not: null },
    },
    _count: true,
    having: {
      counterpartIban: { _count: { gte: 3 } },
    },
    orderBy: { _count: { counterpartIban: "desc" } },
    take: 10,
  });

  // For each pattern, check if a rule already exists
  const suggestions: {
    counterpartIban: string;
    counterpartName: string | null;
    action: string;
    transactionType: string | null;
    occurrences: number;
    humanReadable: string;
    ruleExists: boolean;
  }[] = [];

  for (const pattern of patterns) {
    if (!pattern.counterpartIban) continue;

    // Check if rule already exists for this IBAN
    const existingRule = await prisma.matchingRule.findFirst({
      where: {
        companyId: company.id,
        counterpartIban: pattern.counterpartIban,
        isActive: true,
      },
    });

    if (existingRule) continue; // Already has a rule

    // Get the counterpart name from a recent decision
    const sample = await prisma.controllerDecision.findFirst({
      where: {
        companyId: company.id,
        counterpartIban: pattern.counterpartIban,
        isDefinitive: true,
      },
      orderBy: { createdAt: "desc" },
      select: { counterpartName: true, bankConcept: true, amountRange: true },
    });

    const name = sample?.counterpartName ?? pattern.counterpartIban;
    const action = pattern.controllerAction;
    const txType = pattern.transactionType;

    const humanReadable = `Has resuelto ${pattern._count} ${txType === "cobro" ? "cobros" : txType === "pago" ? "pagos" : "transacciones"} de ${name} como "${action}". ¿Quieres crear una regla automática?`;

    suggestions.push({
      counterpartIban: pattern.counterpartIban,
      counterpartName: name,
      action,
      transactionType: txType,
      occurrences: pattern._count,
      humanReadable,
      ruleExists: false,
    });
  }

  return NextResponse.json({ suggestions });
}, "read:dashboard");
