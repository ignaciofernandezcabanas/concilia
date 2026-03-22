import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";

const onboardingSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    cif: z.string().min(1),
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

    // Create company + user + bank accounts in a transaction
    const company = await prisma.company.create({
      data: {
        name: companyData.name,
        cif: companyData.cif,
        currency: companyData.currency,
      },
    });

    const user = await prisma.user.create({
      data: {
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.name ?? supabaseUser.email!.split("@")[0],
        role: "ADMIN",
        status: "ACTIVE",
        companyId: company.id,
      },
    });

    // Create bank accounts
    for (const ba of bankAccounts) {
      await prisma.ownBankAccount.create({
        data: {
          iban: ba.iban.replace(/\s/g, "").toUpperCase(),
          bankName: ba.bankName ?? null,
          alias: ba.alias ?? null,
          companyId: company.id,
        },
      });
    }

    // Seed PGC accounts if requested
    if (loadPgc) {
      await seedPgcAccounts(company.id);
    }

    return NextResponse.json({
      success: true,
      companyId: company.id,
      userId: user.id,
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
  const accounts = [
    { code: "100", name: "Capital social", group: 1 },
    { code: "112", name: "Reserva legal", group: 1 },
    { code: "113", name: "Reservas voluntarias", group: 1 },
    { code: "129", name: "Resultado del ejercicio", group: 1 },
    { code: "170", name: "Deudas a l/p con entidades de crédito", group: 1 },
    { code: "206", name: "Aplicaciones informáticas", group: 2 },
    { code: "211", name: "Construcciones", group: 2 },
    { code: "216", name: "Mobiliario", group: 2 },
    { code: "217", name: "Equipos para procesos de información", group: 2 },
    { code: "218", name: "Elementos de transporte", group: 2 },
    { code: "281", name: "Amortización acumulada del inmovilizado material", group: 2 },
    { code: "300", name: "Mercaderías", group: 3 },
    { code: "400", name: "Proveedores", group: 4 },
    { code: "410", name: "Acreedores por prestaciones de servicios", group: 4 },
    { code: "430", name: "Clientes", group: 4 },
    { code: "465", name: "Remuneraciones pendientes de pago", group: 4 },
    { code: "470", name: "Hacienda Pública, deudora", group: 4 },
    { code: "472", name: "Hacienda Pública, IVA soportado", group: 4 },
    { code: "473", name: "Hacienda Pública, retenciones y pagos a cuenta", group: 4 },
    { code: "475", name: "Hacienda Pública, acreedora", group: 4 },
    { code: "476", name: "Organismos de la SS, acreedores", group: 4 },
    { code: "477", name: "Hacienda Pública, IVA repercutido", group: 4 },
    { code: "520", name: "Deudas a c/p con entidades de crédito", group: 5 },
    { code: "570", name: "Caja, euros", group: 5 },
    { code: "572", name: "Bancos c/c vista, euros", group: 5 },
    { code: "600", name: "Compras de mercaderías", group: 6, pygLine: "4" },
    { code: "607", name: "Trabajos realizados por otras empresas", group: 6, pygLine: "4" },
    { code: "621", name: "Arrendamientos y cánones", group: 6, pygLine: "7" },
    { code: "622", name: "Reparaciones y conservación", group: 6, pygLine: "7" },
    { code: "623", name: "Servicios de profesionales independientes", group: 6, pygLine: "7" },
    { code: "624", name: "Transportes", group: 6, pygLine: "7" },
    { code: "625", name: "Primas de seguros", group: 6, pygLine: "7" },
    { code: "626", name: "Servicios bancarios y similares", group: 6, pygLine: "7" },
    { code: "627", name: "Publicidad y relaciones públicas", group: 6, pygLine: "7" },
    { code: "628", name: "Suministros", group: 6, pygLine: "7" },
    { code: "629", name: "Otros servicios", group: 6, pygLine: "7" },
    { code: "631", name: "Otros tributos", group: 6, pygLine: "7" },
    { code: "640", name: "Sueldos y salarios", group: 6, pygLine: "6" },
    { code: "642", name: "Seguridad Social a cargo de la empresa", group: 6, pygLine: "6" },
    { code: "649", name: "Otros gastos sociales", group: 6, pygLine: "6" },
    { code: "662", name: "Intereses de deudas", group: 6, pygLine: "13" },
    { code: "669", name: "Otros gastos financieros", group: 6, pygLine: "13" },
    { code: "680", name: "Amortización del inmovilizado intangible", group: 6, pygLine: "8" },
    { code: "681", name: "Amortización del inmovilizado material", group: 6, pygLine: "8" },
    { code: "6300", name: "Impuesto corriente", group: 6, pygLine: "17" },
    { code: "700", name: "Ventas de mercaderías", group: 7, pygLine: "1" },
    { code: "705", name: "Prestaciones de servicios", group: 7, pygLine: "1" },
    { code: "706", name: "Descuentos sobre ventas por pronto pago", group: 7, pygLine: "1" },
    { code: "752", name: "Ingresos por arrendamientos", group: 7, pygLine: "5" },
    { code: "759", name: "Ingresos por servicios diversos", group: 7, pygLine: "5" },
    { code: "762", name: "Ingresos de créditos", group: 7, pygLine: "12" },
    { code: "769", name: "Otros ingresos financieros", group: 7, pygLine: "12" },
  ];

  for (const acc of accounts) {
    await prisma.account.upsert({
      where: { code_companyId: { code: acc.code, companyId } },
      create: {
        code: acc.code,
        name: acc.name,
        group: acc.group,
        parentCode: acc.code.length > 1 ? acc.code.slice(0, -1) : null,
        pygLine: (acc as Record<string, unknown>).pygLine as string ?? null,
        companyId,
      },
      update: {},
    });
  }
}
