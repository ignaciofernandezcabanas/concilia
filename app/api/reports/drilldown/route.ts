import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  report: z.enum(["pyg", "cashflow", "balance"]),
  code: z.string().optional(),
  account: z.string().optional(),
  cashflowType: z.string().optional(),
  treasuryCategory: z.string().optional(),
  group: z.coerce.number().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  asOf: z.coerce.date().optional(),
  month: z.string().optional(),
});

/**
 * GET /api/reports/drilldown
 *
 * Level 1: code/cashflowType/group → aggregated accounts
 * Level 2: account → individual transactions
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const { company } = ctx;
  const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { report, code, account, cashflowType, treasuryCategory, group, from, to, asOf, month } = parsed.data;
  const cid = company.id;

  try {
    // ── Level 2: individual transactions for a specific account ──
    if (account) {
      const periodFrom = from ?? asOf ?? new Date("2000-01-01");
      const periodTo = to ?? asOf ?? new Date("2099-12-31");

      // Balance report: show pending invoices for receivable/payable accounts
      if (report === "balance") {
        const acctCode = parseInt(account);
        // 43x = Clientes (receivable) → pending ISSUED invoices
        if (acctCode >= 430 && acctCode < 440) {
          const invoices = await prisma.invoice.findMany({
            where: { companyId: cid, type: { in: ["ISSUED", "CREDIT_RECEIVED"] }, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, issueDate: { lte: periodTo } },
            include: { contact: { select: { name: true } } },
            take: 100, orderBy: { issueDate: "asc" },
          });
          const acc = await prisma.account.findFirst({ where: { code: account, companyId: cid }, select: { name: true } });
          return NextResponse.json({
            level: "transactions", accountCode: account, accountName: acc?.name ?? account,
            totalAmount: invoices.reduce((s, i) => s + (i.amountPending ?? i.totalAmount - i.amountPaid), 0),
            items: invoices.map((i) => ({
              type: "invoice", id: i.id, date: i.issueDate.toISOString().slice(0, 10),
              description: `${i.number} — ${i.contact?.name ?? ""}`, amount: i.amountPending ?? i.totalAmount - i.amountPaid,
              invoiceNumber: i.number, contactName: i.contact?.name ?? null,
            })),
          });
        }
        // 40x, 41x = Proveedores (payable) → pending RECEIVED invoices
        if ((acctCode >= 400 && acctCode < 420) || (acctCode >= 465 && acctCode < 478)) {
          const invoices = await prisma.invoice.findMany({
            where: { companyId: cid, type: { in: ["RECEIVED", "CREDIT_ISSUED"] }, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, issueDate: { lte: periodTo } },
            include: { contact: { select: { name: true } } },
            take: 100, orderBy: { issueDate: "asc" },
          });
          const acc = await prisma.account.findFirst({ where: { code: account, companyId: cid }, select: { name: true } });
          return NextResponse.json({
            level: "transactions", accountCode: account, accountName: acc?.name ?? account,
            totalAmount: invoices.reduce((s, i) => s + (i.amountPending ?? i.totalAmount - i.amountPaid), 0),
            items: invoices.map((i) => ({
              type: "invoice", id: i.id, date: i.issueDate.toISOString().slice(0, 10),
              description: `${i.number} — ${i.contact?.name ?? ""}`, amount: i.amountPending ?? i.totalAmount - i.amountPaid,
              invoiceNumber: i.number, contactName: i.contact?.name ?? null,
            })),
          });
        }
        // 57x = Cash → last bank transaction with balance
        if (acctCode >= 570 && acctCode < 580) {
          const lastTx = await prisma.bankTransaction.findFirst({
            where: { companyId: cid, valueDate: { lte: periodTo }, balanceAfter: { not: null } },
            orderBy: { valueDate: "desc" }, select: { id: true, valueDate: true, concept: true, balanceAfter: true },
          });
          const acc = await prisma.account.findFirst({ where: { code: account, companyId: cid }, select: { name: true } });
          return NextResponse.json({
            level: "transactions", accountCode: account, accountName: acc?.name ?? account,
            totalAmount: lastTx?.balanceAfter ?? 0,
            items: lastTx ? [{ type: "bank_transaction", id: lastTx.id, date: lastTx.valueDate.toISOString().slice(0, 10), description: `Saldo: ${lastTx.concept ?? "último movimiento"}`, amount: lastTx.balanceAfter ?? 0 }] : [],
          });
        }
      }

      // Default: invoice lines + classified txs (for PyG / Cashflow)
      const invoiceLines = await prisma.invoiceLine.findMany({
        where: {
          account: { code: account, companyId: cid },
          invoice: { issueDate: { gte: periodFrom, lte: periodTo }, status: { not: "CANCELLED" } },
        },
        include: {
          invoice: { select: { id: true, number: true, issueDate: true, type: true, contact: { select: { name: true } } } },
        },
        take: 100,
        orderBy: { invoice: { issueDate: "asc" } },
      });

      const classifiedTx = await prisma.bankTransaction.findMany({
        where: {
          companyId: cid,
          valueDate: { gte: periodFrom, lte: periodTo },
          status: "CLASSIFIED",
          classification: { account: { code: account, companyId: cid } },
        },
        select: { id: true, valueDate: true, concept: true, amount: true, counterpartName: true, status: true },
        take: 100,
        orderBy: { valueDate: "asc" },
      });

      const items = [
        ...invoiceLines.map((l) => ({
          type: "invoice" as const,
          id: l.invoice.id,
          date: l.invoice.issueDate.toISOString().slice(0, 10),
          description: `${l.invoice.number} — ${l.invoice.contact?.name ?? ""}`,
          amount: l.totalAmount * (l.invoice.type === "RECEIVED" || l.invoice.type === "CREDIT_ISSUED" ? -1 : 1),
          invoiceNumber: l.invoice.number,
          contactName: l.invoice.contact?.name ?? null,
        })),
        ...classifiedTx.map((t) => ({
          type: "bank_transaction" as const,
          id: t.id,
          date: t.valueDate.toISOString().slice(0, 10),
          description: t.concept ?? "Sin concepto",
          amount: t.amount,
          counterpartName: t.counterpartName,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      const acc = await prisma.account.findFirst({ where: { code: account, companyId: cid }, select: { name: true } });

      return NextResponse.json({
        level: "transactions",
        accountCode: account,
        accountName: acc?.name ?? account,
        totalAmount: items.reduce((s, i) => s + i.amount, 0),
        items,
      });
    }

    // ── Level 1: aggregated accounts ──

    if (report === "pyg" && code) {
      // Find accounts whose pygLine matches this code
      const periodFrom = from ?? new Date("2000-01-01");
      const periodTo = to ?? new Date("2099-12-31");

      // Aggregate from invoice lines
      const invoiceLines = await prisma.invoiceLine.findMany({
        where: {
          account: { pygLine: code, companyId: cid },
          invoice: { issueDate: { gte: periodFrom, lte: periodTo }, status: { not: "CANCELLED" } },
        },
        include: {
          account: { select: { code: true, name: true } },
          invoice: { select: { type: true } },
        },
      });

      // Aggregate from classified txs
      const classifiedTx = await prisma.bankTransaction.findMany({
        where: {
          companyId: cid,
          valueDate: { gte: periodFrom, lte: periodTo },
          status: "CLASSIFIED",
          classification: { account: { pygLine: code, companyId: cid } },
        },
        include: { classification: { include: { account: { select: { code: true, name: true } } } } },
      });

      // Group by account code
      const accountMap = new Map<string, { name: string; amount: number; count: number }>();

      for (const l of invoiceLines) {
        if (!l.account) continue;
        const key = l.account.code;
        const existing = accountMap.get(key) ?? { name: l.account.name, amount: 0, count: 0 };
        const sign = l.invoice.type === "CREDIT_ISSUED" || l.invoice.type === "CREDIT_RECEIVED" ? -1 : 1;
        existing.amount += l.totalAmount * sign;
        existing.count++;
        accountMap.set(key, existing);
      }

      for (const t of classifiedTx) {
        if (!t.classification?.account) continue;
        const key = t.classification.account.code;
        const existing = accountMap.get(key) ?? { name: t.classification.account.name, amount: 0, count: 0 };
        existing.amount += t.amount;
        existing.count++;
        accountMap.set(key, existing);
      }

      const items = Array.from(accountMap.entries())
        .map(([accountCode, data]) => ({
          accountCode,
          accountName: data.name,
          amount: Math.round(data.amount * 100) / 100,
          transactionCount: data.count,
        }))
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

      return NextResponse.json({ level: "accounts", items });
    }

    if (report === "cashflow" && (cashflowType || treasuryCategory)) {
      const periodFrom = from ?? new Date("2000-01-01");
      const periodTo = to ?? new Date("2099-12-31");

      if (treasuryCategory) {
        // Treasury drill-down: return individual transactions for this category
        let where: Record<string, unknown> = {
          companyId: cid,
          valueDate: { gte: periodFrom, lte: periodTo },
          status: { notIn: ["DUPLICATE", "IGNORED"] },
        };

        // Map category to filters
        switch (treasuryCategory) {
          case "cobrosClientes": where.amount = { gt: 0 }; where.status = "RECONCILED"; break;
          case "pagosProveedores": where.amount = { lt: 0 }; where.status = "RECONCILED"; break;
          case "nominas": where.classification = { account: { code: { in: ["640", "641", "642", "649"] } } }; break;
          case "impuestos": where.classification = { account: { code: { startsWith: "47" } } }; break;
          default: where.amount = { lt: 0 }; break;
        }

        const txs = await prisma.bankTransaction.findMany({
          where: where as never,
          select: { id: true, valueDate: true, concept: true, amount: true, counterpartName: true, status: true },
          take: 100,
          orderBy: { valueDate: "asc" },
        });

        return NextResponse.json({
          level: "transactions",
          items: txs.map((t) => ({
            type: "bank_transaction",
            id: t.id,
            date: t.valueDate.toISOString().slice(0, 10),
            description: t.concept ?? "Sin concepto",
            amount: t.amount,
            counterpartName: t.counterpartName,
            status: t.status,
          })),
        });
      }

      // cashflowType drill-down
      const txs = await prisma.bankTransaction.findMany({
        where: {
          companyId: cid,
          valueDate: { gte: periodFrom, lte: periodTo },
          status: { notIn: ["DUPLICATE", "IGNORED"] },
          classification: { cashflowType: cashflowType as never },
        },
        include: { classification: { include: { account: { select: { code: true, name: true } } } } },
      });

      const accountMap = new Map<string, { name: string; amount: number; count: number }>();
      for (const t of txs) {
        const key = t.classification?.account?.code ?? "sin_cuenta";
        const name = t.classification?.account?.name ?? "Sin cuenta";
        const existing = accountMap.get(key) ?? { name, amount: 0, count: 0 };
        existing.amount += t.amount;
        existing.count++;
        accountMap.set(key, existing);
      }

      return NextResponse.json({
        level: "accounts",
        items: Array.from(accountMap.entries()).map(([code, d]) => ({
          accountCode: code, accountName: d.name, amount: Math.round(d.amount * 100) / 100, transactionCount: d.count,
        })),
      });
    }

    if (report === "balance" && group != null) {
      const asOfDate = asOf ?? new Date();
      const accounts = await prisma.account.findMany({
        where: { companyId: cid, group, isActive: true },
        select: { code: true, name: true },
      });

      // For balance, return all accounts in the group (even if 0 — the PyG fills them)
      return NextResponse.json({
        level: "accounts",
        items: accounts.map((a) => ({ accountCode: a.code, accountName: a.name, amount: 0, transactionCount: 0 })),
      });
    }

    return NextResponse.json({ error: "Missing required params (code, account, cashflowType, or group)." }, { status: 400 });
  } catch (err) {
    console.error("[drilldown] Error:", err);
    return errorResponse("Drilldown failed.", err, 500);
  }
}, "read:reports");
