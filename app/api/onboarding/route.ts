import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";

const onboardingSchema = z.object({
  company: z.object({
    name: z.string().min(1, "Nombre es requerido"),
    cif: z.string().regex(
      /^[A-HJNP-SUVW]\d{7}[0-9A-J]$|^\d{8}[A-Z]$|^[XYZ]\d{7}[A-Z]$/,
      "CIF/NIF inválido"
    ),
    currency: z.string().default("EUR"),
  }),
  bankAccounts: z.array(z.object({
    iban: z.string().min(1),
    bankName: z.string().optional(),
    alias: z.string().optional(),
  })).min(1, "Al menos una cuenta bancaria es requerida"),
  loadPgc: z.boolean().default(true),
});

/**
 * POST /api/onboarding
 *
 * Creates company, links user as ADMIN, creates bank accounts,
 * optionally seeds PGC accounts.
 *
 * Auth: JWT only (no company context — it doesn't exist yet).
 */
export async function POST(req: NextRequest) {
  try {
    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authorization required." }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const supabase = createServerClient();
    const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !supabaseUser) {
      return NextResponse.json({ error: "Invalid token." }, { status: 401 });
    }

    // Check user doesn't already have a company
    const existingUser = await prisma.user.findFirst({
      where: { email: supabaseUser.email!, status: "ACTIVE" },
    });
    if (existingUser) {
      return NextResponse.json({ error: "Ya tienes una empresa configurada." }, { status: 400 });
    }

    // Parse body
    const body = await req.json();
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const { company: companyData, bankAccounts, loadPgc } = parsed.data;

    // Create company + user + bank accounts in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyData.name,
          cif: companyData.cif,
          currency: companyData.currency,
        },
      });

      const user = await tx.user.create({
        data: {
          email: supabaseUser.email!,
          name: supabaseUser.user_metadata?.name ?? supabaseUser.email!.split("@")[0],
          role: "ADMIN",
          status: "ACTIVE",
          companyId: company.id,
        },
      });

      for (const ba of bankAccounts) {
        await tx.ownBankAccount.create({
          data: {
            iban: ba.iban.replace(/\s/g, "").toUpperCase(),
            bankName: ba.bankName ?? null,
            alias: ba.alias ?? null,
            companyId: company.id,
          },
        });
      }

      return { company, user };
    });

    // PGC seed outside transaction (non-critical, can be retried)
    if (loadPgc) {
      await seedPgcAccounts(result.company.id);
    }

    return NextResponse.json({
      success: true,
      companyId: result.company.id,
      userId: result.user.id,
      accountsCreated: bankAccounts.length,
      pgcLoaded: loadPgc,
    });
  } catch (err) {
    console.error("[onboarding] Error:", err);
    return NextResponse.json({
      error: "Error en el onboarding.",
      details: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

// ── PGC Seed (inline, same data as prisma/seed.ts) ──

async function seedPgcAccounts(companyId: string) {
  const { PGC_SEED_ACCOUNTS } = await import("@/lib/pgc-seed-data");
  for (const acc of PGC_SEED_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code_companyId: { code: acc.code, companyId } },
      create: {
        code: acc.code,
        name: acc.name,
        group: acc.group,
        parentCode: acc.code.length > 1 ? acc.code.slice(0, -1) : null,
        pygLine: acc.pygLine ?? null,
        companyId,
      },
      update: {},
    });
  }
}