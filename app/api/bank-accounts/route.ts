/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";
import { detectBankFromIBAN, suggestPGCAccount } from "@/lib/bank/detect-bank";

const createSchema = z
  .object({
    iban: z.string().optional(),
    bankName: z.string().optional(),
    alias: z.string().min(1, "Alias es obligatorio"),
    accountType: z.enum([
      "CHECKING",
      "SAVINGS",
      "CREDIT_LINE",
      "LOAN",
      "CREDIT_CARD",
      "CONFIRMING",
      "FACTORING",
    ]),
    connectionMethod: z.enum(["PSD2", "FILE_IMPORT"]).default("FILE_IMPORT"),
    pgcAccountCode: z.string().optional(),
    lastFourDigits: z
      .string()
      .regex(/^\d{4}$/, "Debe ser 4 dígitos")
      .optional(),
    contractNumber: z.string().optional(),
    detectionPattern: z.string().optional(),
    creditLimit: z.number().positive().optional(),
    interestRate: z.number().min(0).max(100).optional(),
    monthlyPayment: z.number().positive().optional(),
    startDate: z.coerce.date().optional(),
    maturityDate: z.coerce.date().optional(),
    paymentDay: z.number().int().min(1).max(31).optional(),
    initialBalance: z.number().optional(),
    initialBalanceDate: z.coerce.date().optional(),
    currency: z.string().length(3).default("EUR"),
  })
  .superRefine((data, ctx) => {
    const needsIBAN = ["CHECKING", "SAVINGS", "CREDIT_LINE", "CONFIRMING", "FACTORING"];
    if (needsIBAN.includes(data.accountType) && !data.iban) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN es obligatorio para este tipo de cuenta",
        path: ["iban"],
      });
    }
    if (data.accountType === "CREDIT_CARD" && !data.lastFourDigits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Últimos 4 dígitos son obligatorios para tarjetas de crédito",
        path: ["lastFourDigits"],
      });
    }
    const needsFinancing = ["LOAN", "CREDIT_LINE", "CONFIRMING", "FACTORING"];
    if (needsFinancing.includes(data.accountType)) {
      if (data.creditLimit == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Límite de crédito es obligatorio para cuentas de financiación",
          path: ["creditLimit"],
        });
      }
    }
    if (data.accountType === "LOAN") {
      if (data.interestRate == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tipo de interés es obligatorio para préstamos",
          path: ["interestRate"],
        });
      }
      if (data.monthlyPayment == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cuota mensual es obligatoria para préstamos",
          path: ["monthlyPayment"],
        });
      }
    }
    if (data.iban) {
      const cleaned = data.iban.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}\d{22}$/.test(cleaned) && !/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Formato de IBAN no válido",
          path: ["iban"],
        });
      }
    }
  });

/**
 * GET /api/bank-accounts
 * List bank accounts grouped by type, with transaction count.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;
    const accounts = await (db as any).ownBankAccount.findMany({
      orderBy: [{ isActive: "desc" }, { accountType: "asc" }, { alias: "asc" }],
    });

    // Get transaction counts per IBAN
    const ibans = accounts.map((a: any) => a.iban).filter(Boolean);
    const txCounts: Record<string, number> = {};
    if (ibans.length > 0) {
      const counts = await Promise.all(
        ibans.map(async (iban: string) => {
          const count = await db.bankTransaction.count({
            where: { counterpartIban: iban },
          });
          return { iban, count };
        })
      );
      for (const c of counts) txCounts[c.iban] = c.count;
    }

    const enriched = accounts.map((a: any) => ({
      ...a,
      transactionCount: txCounts[a.iban] ?? 0,
    }));

    // Group by category
    const operative = ["CHECKING", "SAVINGS"];
    const financing = ["CREDIT_LINE", "LOAN", "CREDIT_CARD", "CONFIRMING", "FACTORING"];

    const grouped = {
      operativas: enriched.filter((a: any) => a.isActive && operative.includes(a.accountType)),
      financiacion: enriched.filter((a: any) => a.isActive && financing.includes(a.accountType)),
      inactivas: enriched.filter((a: any) => !a.isActive),
    };

    const totals = {
      operativas: grouped.operativas.reduce((s: number, a: any) => s + (a.currentBalance ?? 0), 0),
      financiacion: grouped.financiacion.reduce(
        (s: number, a: any) => s + (a.currentBalance ?? 0),
        0
      ),
    };

    return NextResponse.json({ accounts: grouped, totals });
  } catch (err) {
    return errorResponse("Error al listar cuentas bancarias", err);
  }
}, "read:transactions");

/**
 * POST /api/bank-accounts
 * Create a new bank account with auto-detection and PGC suggestion.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos no válidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const db = ctx.db;

    // Normalize IBAN
    if (data.iban) {
      data.iban = data.iban.replace(/\s/g, "").toUpperCase();
    }

    // Auto-detect bank from IBAN
    let bankName = data.bankName;
    if (data.iban && !bankName) {
      const detected = detectBankFromIBAN(data.iban);
      if (detected) bankName = detected.bankName;
    }

    // Check IBAN uniqueness
    if (data.iban) {
      const existing = await (db as any).ownBankAccount.findFirst({
        where: { iban: data.iban },
      });
      if (existing) {
        return NextResponse.json({ error: "Ya existe una cuenta con este IBAN" }, { status: 409 });
      }
    }

    // Auto-suggest PGC code if not provided
    let pgcCode = data.pgcAccountCode;
    if (!pgcCode) {
      const allAccounts = await (db as any).ownBankAccount.findMany({
        select: { pgcAccountCode: true },
      });
      const existingCodes = allAccounts.map((a: any) => a.pgcAccountCode).filter(Boolean);
      pgcCode = suggestPGCAccount(data.accountType, existingCodes);
    }

    const account = await (db as any).ownBankAccount.create({
      data: {
        iban: data.iban ?? "",
        bankName: bankName ?? null,
        alias: data.alias,
        accountType: data.accountType,
        connectionMethod: data.connectionMethod,
        pgcAccountCode: pgcCode,
        lastFourDigits: data.lastFourDigits ?? null,
        contractNumber: data.contractNumber ?? null,
        detectionPattern: data.detectionPattern ?? null,
        creditLimit: data.creditLimit ?? null,
        interestRate: data.interestRate ?? null,
        monthlyPayment: data.monthlyPayment ?? null,
        startDate: data.startDate ?? null,
        maturityDate: data.maturityDate ?? null,
        paymentDay: data.paymentDay ?? null,
        initialBalance: data.initialBalance ?? null,
        initialBalanceDate: data.initialBalanceDate ?? null,
        currentBalance: data.initialBalance ?? null,
        currentBalanceDate: data.initialBalanceDate ?? null,
        currency: data.currency,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    return errorResponse("Error al crear cuenta bancaria", err);
  }
}, "manage:settings");
