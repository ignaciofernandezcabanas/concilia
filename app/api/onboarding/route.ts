import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: creates new Organization/Company
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";

const onboardingSchema = z.object({
  mode: z.enum(["standalone", "group"]).default("standalone"),
  orgName: z.string().optional(),
  company: z.object({
    name: z.string().min(1, "Nombre es requerido"),
    shortName: z.string().optional(),
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
 * Creates organization + company, links user as OWNER, creates bank accounts,
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

    const { mode, orgName, company: companyData, bankAccounts, loadPgc } = parsed.data;
    const isGroup = mode === "group";
    const companyType = isGroup ? "SUBSIDIARY" : "STANDALONE";
    const resolvedOrgName = isGroup && orgName ? orgName : companyData.name;

    // Create org + company + user + membership + bank accounts
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: resolvedOrgName },
      });

      const company = await tx.company.create({
        data: {
          name: companyData.name,
          shortName: companyData.shortName ?? null,
          cif: companyData.cif,
          currency: companyData.currency,
          type: companyType,
          organizationId: org.id,
        },
      });

      const user = await tx.user.create({
        data: {
          email: supabaseUser.email!,
          name: supabaseUser.user_metadata?.name ?? supabaseUser.email!.split("@")[0],
          role: "ADMIN",
          status: "ACTIVE",
          companyId: company.id,
          activeOrgId: org.id,
          activeCompanyId: company.id,
        },
      });

      // Create Membership + CompanyScope
      const membership = await tx.membership.create({
        data: { role: "OWNER", status: "ACTIVE", userId: user.id, organizationId: org.id },
      });
      await tx.companyScope.create({
        data: { role: "ADMIN", membershipId: membership.id, companyId: company.id },
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

      return { company, user, org };
    });

    // PGC seed outside transaction (non-critical, can be retried)
    if (loadPgc) {
      await seedPgcAccounts(result.company.id);
    }

    return NextResponse.json({
      success: true,
      companyId: result.company.id,
      userId: result.user.id,
      orgId: result.org.id,
      mode,
      accountsCreated: bankAccounts.length,
      pgcLoaded: loadPgc,
    });
  } catch (err) {
    console.error("[onboarding] Error:", err);
    return errorResponse("Error en el onboarding.", err, 500);
  }
}

// ── PGC Seed ──

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
