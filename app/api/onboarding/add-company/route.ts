import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: creates new Organization/Company
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";
import { seedPgcAccounts } from "@/lib/utils/seed-pgc";

const addCompanySchema = z.object({
  company: z.object({
    name: z.string().min(1, "Nombre es requerido"),
    shortName: z.string().optional(),
    cif: z
      .string()
      .regex(/^[A-HJNP-SUVW]\d{7}[0-9A-J]$|^\d{8}[A-Z]$|^[XYZ]\d{7}[A-Z]$/, "CIF/NIF inválido"),
    currency: z.string().default("EUR"),
  }),
  bankAccounts: z
    .array(
      z.object({
        iban: z.string().min(1),
        bankName: z.string().optional(),
        alias: z.string().optional(),
      })
    )
    .min(1, "Al menos una cuenta bancaria es requerida"),
  loadPgc: z.boolean().default(true),
});

/**
 * POST /api/onboarding/add-company
 *
 * Adds a new company to the user's active organization.
 * Only OWNER/ADMIN of the org can add companies.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authorization required." }, { status: 401 });
    }

    const supabase = createServerClient();
    const {
      data: { user: supabaseUser },
      error: authError,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !supabaseUser) {
      return NextResponse.json({ error: "Invalid token." }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: { email: supabaseUser.email!, status: "ACTIVE" },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { organization: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 401 });
    }

    // Find the active org membership
    const orgId = user.activeOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No active organization." }, { status: 400 });
    }

    const membership = user.memberships.find((m) => m.organizationId === orgId);
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Solo OWNER o ADMIN pueden añadir sociedades." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = addCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { company: companyData, bankAccounts, loadPgc } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyData.name,
          shortName: companyData.shortName ?? null,
          cif: companyData.cif,
          currency: companyData.currency,
          type: "SUBSIDIARY",
          organizationId: orgId,
        },
      });

      // Grant the user access to the new company
      await tx.companyScope.create({
        data: { role: "ADMIN", membershipId: membership.id, companyId: company.id },
      });

      // Switch user to the new company
      await tx.user.update({
        where: { id: user.id },
        data: { activeCompanyId: company.id },
      });

      // Update old company type to SUBSIDIARY if it was STANDALONE
      await tx.company.updateMany({
        where: { organizationId: orgId, type: "STANDALONE" },
        data: { type: "SUBSIDIARY" },
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

      return company;
    });

    if (loadPgc) {
      await seedPgcAccounts(result.id);
    }

    return NextResponse.json({
      success: true,
      companyId: result.id,
      accountsCreated: bankAccounts.length,
      pgcLoaded: loadPgc,
    });
  } catch (err) {
    console.error("[onboarding/add-company] Error:", err);
    return errorResponse("Error al añadir sociedad.", err, 500);
  }
}

// seedPgcAccounts imported from shared utility
