/**
 * Synthetic seed for Concilia — creates a complete demo company with ~90 invoices,
 * ~140 bank transactions covering all 18 reconciliation scenarios, rules, patterns,
 * controller decisions, and PGC accounts.
 *
 * Usage: npx prisma db seed
 * Idempotent: checks for existing company CIF before creating.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { PGC_SEED_ACCOUNTS } from "../lib/pgc-seed-data";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Constants ──
const DEMO_EMAIL = "admin@example.com";
const DEMO_PASSWORD = "1234";
const COMPANY_CIF = "B87654321";

const OWN_IBAN_1 = "ES7620770024003102575766";
const OWN_IBAN_2 = "ES1234567890123456789012";

// Contact IBANs
const IBANS = {
  levante: "ES1111111111111111111111",
  costa: "ES2222222222222222222222",
  hosteleria: "ES3333333333333333333333",
  mercados: "ES4444444444444444444444",
  exportadora: "ES5555555555555555555555",
  catering: "ES6666666666666666666666",
  materias: "ES7777777777777777777777",
  envases: "ES8888888888888888888888",
  transportes: "ES9999999999999999999999",
  asesoria: "ES1010101010101010101010",
  inmobiliaria: "ES1212121212121212121212",
  vodafone: "ES1313131313131313131313",
  endesa: "ES1414141414141414141414",
  grupo: "ES1515151515151515151515",
  tgss: "ES9090909090909090909090",
  caixaPrestamoIban: "ES8080808080808080808080",
};

// Helpers
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const round = (n: number) => Math.round(n * 100) / 100;
const net = (total: number) => round(total / 1.21);
const vat = (total: number) => round(total - net(total));

let invoiceCounter = 0;
let provCounter = 0;
let ncCounter = 0;
const fraNum = () => `FRA-2026-${String(++invoiceCounter).padStart(3, "0")}`;
const provNum = () => `PROV-2026-${String(++provCounter).padStart(3, "0")}`;
const ncNum = () => `NC-2026-${String(++ncCounter).padStart(3, "0")}`;

let balance = 150000;
const txs: Array<{
  amount: number;
  valueDate: Date;
  concept: string;
  counterpartIban: string | null;
  counterpartName: string | null;
  status: string;
  balanceAfter: number;
  reference?: string;
  detectedType?: string;
  priority?: string;
}> = [];

function addTx(
  amount: number,
  date: Date,
  concept: string,
  iban: string | null,
  name: string | null,
  status = "PENDING"
) {
  balance = round(balance + amount);
  txs.push({
    amount,
    valueDate: date,
    concept,
    counterpartIban: iban,
    counterpartName: name,
    status,
    balanceAfter: balance,
  });
}

// ── Main ──
async function main() {
  // Step 0: Idempotency
  const existing = await prisma.company.findFirst({ where: { cif: COMPANY_CIF } });
  if (existing) {
    const p = prisma as any;
    const hasEntries = await p.journalEntry.findFirst({ where: { companyId: existing.id } });
    if (hasEntries) {
      // Check if comprehensive demo data exists
      const hasInquiries =
        (await p.inquiry?.count?.({ where: { companyId: existing.id } }).catch(() => 0)) ?? 0;
      if (hasInquiries > 0) {
        // Check if agent threads need seeding
        const hasThreads =
          (await p.agentThread?.count?.({ where: { companyId: existing.id } }).catch(() => 0)) ?? 0;
        if (hasThreads === 0) {
          console.log("📦 Seeding agent threads...");
          const orgId = (existing as any).organizationId ?? "";
          const contacts = await prisma.contact.findMany({ where: { companyId: existing.id } });
          await seedAgentThreads(existing.id, orgId, contacts);
          console.log("🌱 Agent threads seed completado.");
          return;
        }
        console.log("⚠️  All seed data exists. Run prisma migrate reset to re-seed.");
        return;
      }
      // Seed comprehensive demo data only
      console.log("📦 Adding comprehensive demo data...");
      const user = await prisma.user.findFirst({ where: { companyId: existing.id } });
      const orgId = (existing as any).organizationId ?? "";
      const contacts = await prisma.contact.findMany({ where: { companyId: existing.id } });
      const invoices = await prisma.invoice.findMany({ where: { companyId: existing.id } });
      await seedComprehensiveDemo(existing.id, orgId, user?.id ?? "", contacts, invoices);
      console.log("🌱 Comprehensive demo seed completado.");
      return;
    }
    console.log("📦 Company exists — seeding new features only...");
    const user = await prisma.user.findFirst({ where: { companyId: existing.id } });
    const orgId = (existing as any).organizationId ?? "";
    await seedNewFeatures(existing.id, orgId, user?.id ?? "");
    console.log("\n🌱 New features seed completado.");
    return;
  }

  // Step 1: Supabase Auth user
  try {
    await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already")) console.warn("Auth user warning:", msg);
  }
  console.log(`✅ Supabase Auth: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // Step 2: Organization + Company
  const org = await prisma.organization.create({
    data: { name: "Grupo Alimentación Mediterránea" },
  });

  const company = await prisma.company.create({
    data: {
      name: "Alimentación Mediterránea SL",
      cif: COMPANY_CIF,
      currency: "EUR",
      type: "STANDALONE",
      autoApproveThreshold: 0.9,
      materialityThreshold: 5000,
      materialityMinor: 5,
      preAlertDays: 7,
      organizationId: org.id,
    },
  });
  const cid = company.id;

  // Step 3: User + Membership
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Admin Demo",
      role: "ADMIN",
      status: "ACTIVE",
      companyId: cid,
      activeOrgId: org.id,
      activeCompanyId: cid,
    },
  });
  const userId = user.id;

  // Create Membership (OWNER of the organization)
  const membership = await prisma.membership.create({
    data: {
      role: "OWNER",
      status: "ACTIVE",
      userId: user.id,
      organizationId: org.id,
    },
  });

  // Create CompanyScope (ADMIN of the company)
  await prisma.companyScope.create({
    data: { role: "ADMIN", membershipId: membership.id, companyId: cid },
  });

  // Step 4: Own bank accounts
  await prisma.ownBankAccount.createMany({
    data: [
      {
        iban: OWN_IBAN_1,
        bankName: "CaixaBank",
        alias: "Cuenta principal",
        companyId: cid,
        accountType: "CHECKING",
        pgcAccountCode: "5720001",
        initialBalance: 45230.5,
        initialBalanceDate: new Date("2026-01-01"),
        currentBalance: 45230.5,
        currentBalanceDate: new Date("2026-01-01"),
      },
      {
        iban: OWN_IBAN_2,
        bankName: "BBVA",
        alias: "Cuenta operativa",
        companyId: cid,
        accountType: "CHECKING",
        pgcAccountCode: "5720002",
        initialBalance: 12800.0,
        initialBalanceDate: new Date("2026-01-01"),
        currentBalance: 12800.0,
        currentBalanceDate: new Date("2026-01-01"),
      },
      {
        iban: "ES9121000418450200051332",
        bankName: "CaixaBank",
        alias: "Póliza de crédito",
        companyId: cid,
        accountType: "CREDIT_LINE",
        pgcAccountCode: "5201001",
        creditLimit: 50000,
        interestRate: 4.5,
        currentBalance: -12000,
        currentBalanceDate: new Date("2026-01-15"),
        maturityDate: new Date("2027-06-30"),
      },
      {
        iban: "ES6801822200960201234567",
        bankName: "BBVA",
        alias: "Préstamo inversión",
        companyId: cid,
        accountType: "LOAN",
        pgcAccountCode: "1700001",
        creditLimit: 120000,
        interestRate: 4.5,
        monthlyPayment: 2340,
        currentBalance: -98500,
        currentBalanceDate: new Date("2026-01-01"),
        startDate: new Date("2024-06-01"),
        maturityDate: new Date("2029-06-01"),
        paymentDay: 5,
      },
    ],
  });

  // Step 5: PGC Accounts
  for (const acc of PGC_SEED_ACCOUNTS) {
    await prisma.account.create({
      data: {
        code: acc.code,
        name: acc.name,
        group: acc.group,
        parentCode: acc.code.length > 1 ? acc.code.slice(0, -1) : null,
        pygLine: acc.pygLine ?? null,
        companyId: cid,
      },
    });
  }

  // Step 6: Contacts
  const contacts = await Promise.all([
    mkContact(cid, "Distribuidora Levante SL", "B11111111", IBANS.levante, "CUSTOMER", 45),
    mkContact(cid, "Supermercados Costa SL", "B22222222", IBANS.costa, "CUSTOMER", 60),
    mkContact(cid, "Hostelería del Sur SA", "A33333333", IBANS.hosteleria, "CUSTOMER", 30),
    mkContact(cid, "Mercados Regionales SL", "B44444444", IBANS.mercados, "CUSTOMER", 90),
    mkContact(cid, "Exportadora Ibérica SL", "B55555555", IBANS.exportadora, "CUSTOMER", 30),
    mkContact(cid, "Catering Barcelona SL", "B66666666", IBANS.catering, "CUSTOMER", 45),
    mkContact(cid, "Materias Primas del Campo SL", "B77777777", IBANS.materias, "SUPPLIER", 30),
    mkContact(cid, "Envases y Packaging SA", "A88888888", IBANS.envases, "SUPPLIER", 45),
    mkContact(cid, "Transportes Rápidos SL", "B99999999", IBANS.transportes, "SUPPLIER", 30),
    mkContact(cid, "Asesoría Fiscal López SL", "B10101010", IBANS.asesoria, "SUPPLIER", 15),
    mkContact(cid, "Inmobiliaria Nave Central SL", "B12121212", IBANS.inmobiliaria, "SUPPLIER", 0),
    mkContact(cid, "Vodafone España SAU", "A13131313", IBANS.vodafone, "SUPPLIER", 0),
    mkContact(cid, "Endesa Energía SA", "A14141414", IBANS.endesa, "SUPPLIER", 0),
    mkContact(cid, "Grupo Alimentario Norte SL", "B15151515", IBANS.grupo, "BOTH", 45),
  ]);
  const c = Object.fromEntries(contacts.map((ct) => [ct.cif!, ct]));

  // Step 7: Invoices
  const invoices: Awaited<ReturnType<typeof mkInvoice>>[] = [];
  const inv = async (...args: Parameters<typeof mkInvoice>) => {
    const i = await mkInvoice(...args);
    invoices.push(i);
    return i;
  };

  // Distribuidora Levante — 8 issued
  const lev1 = await inv(
    cid,
    c.B11111111.id,
    fraNum(),
    "ISSUED",
    d(2026, 1, 5),
    7843.21,
    "PAID",
    45
  );
  const lev2 = await inv(
    cid,
    c.B11111111.id,
    fraNum(),
    "ISSUED",
    d(2026, 1, 12),
    12567.89,
    "PAID",
    45
  );
  const lev3 = await inv(
    cid,
    c.B11111111.id,
    fraNum(),
    "ISSUED",
    d(2026, 1, 20),
    4521.0,
    "PAID",
    45
  );
  await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026, 2, 3), 9876.54, "PAID", 45);
  await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026, 2, 15), 3210.0, "PAID", 45);
  const levPend1 = await inv(
    cid,
    c.B11111111.id,
    fraNum(),
    "ISSUED",
    d(2026, 2, 22),
    8500.0,
    "PENDING",
    45
  );
  const levPend2 = await inv(
    cid,
    c.B11111111.id,
    fraNum(),
    "ISSUED",
    d(2026, 3, 5),
    6750.0,
    "PENDING",
    45
  );
  await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026, 1, 8), 5400.0, "OVERDUE", 45);

  // Supermercados Costa — 7 issued
  const costaPartial = await inv(
    cid,
    c.B22222222.id,
    fraNum(),
    "ISSUED",
    d(2026, 1, 10),
    18500.0,
    "PARTIAL",
    60,
    11100
  );
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026, 1, 18), 12340.5, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026, 2, 2), 8760.0, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026, 2, 14), 22100.0, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026, 2, 25), 5430.0, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026, 3, 4), 15800.0, "PENDING", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026, 3, 12), 9200.0, "PENDING", 60);

  // Hostelería del Sur — 6 issued, all PAID
  for (const [day, amt] of [
    [3, 2150],
    [15, 3420],
    [25, 1890],
    [8, 4100],
    [18, 2750],
    [28, 1560],
  ] as const) {
    const m = day <= 25 && invoiceCounter < 20 ? 1 : day <= 25 ? 2 : 3;
    await inv(cid, c.A33333333.id, fraNum(), "ISSUED", d(2026, m, day), amt, "PAID", 30);
  }

  // Mercados Regionales — 5 issued
  const mercOverdue = await inv(
    cid,
    c.B44444444.id,
    fraNum(),
    "ISSUED",
    d(2025, 11, 15),
    6200.0,
    "OVERDUE",
    90
  );
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026, 1, 10), 4500.0, "PAID", 90);
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026, 1, 22), 7800.0, "PAID", 90);
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026, 2, 8), 3200.0, "PENDING", 90);
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026, 3, 1), 5600.0, "PENDING", 90);

  // Exportadora Ibérica — 4 issued (large amounts for materiality)
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026, 1, 5), 35000.0, "PAID", 30);
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026, 2, 10), 48500.0, "PAID", 30);
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026, 2, 28), 22000.0, "PENDING", 30);
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026, 3, 15), 41000.0, "PENDING", 30);

  // Catering Barcelona — 5 issued, all PENDING (for grouped match)
  const cat1 = await inv(
    cid,
    c.B66666666.id,
    fraNum(),
    "ISSUED",
    d(2026, 2, 5),
    1250.0,
    "PENDING",
    45
  );
  const cat2 = await inv(
    cid,
    c.B66666666.id,
    fraNum(),
    "ISSUED",
    d(2026, 2, 12),
    890.0,
    "PENDING",
    45
  );
  const cat3 = await inv(
    cid,
    c.B66666666.id,
    fraNum(),
    "ISSUED",
    d(2026, 2, 20),
    2100.0,
    "PENDING",
    45
  );
  await inv(cid, c.B66666666.id, fraNum(), "ISSUED", d(2026, 3, 3), 750.0, "PENDING", 45);
  await inv(cid, c.B66666666.id, fraNum(), "ISSUED", d(2026, 3, 10), 560.0, "PENDING", 45);

  // Grupo Alimentario — 3 ISSUED
  await inv(cid, c.B15151515.id, fraNum(), "ISSUED", d(2026, 1, 15), 8400.0, "PAID", 45);
  await inv(cid, c.B15151515.id, fraNum(), "ISSUED", d(2026, 2, 10), 11200.0, "PAID", 45);
  await inv(cid, c.B15151515.id, fraNum(), "ISSUED", d(2026, 3, 5), 6800.0, "PENDING", 45);

  // --- RECEIVED invoices ---
  // Materias Primas — 6
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026, 1, 8), 14520.3, "PAID", 30);
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026, 1, 20), 8934.5, "PAID", 30);
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026, 2, 5), 17650.0, "PAID", 30);
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026, 2, 18), 6230.0, "PAID", 30);
  const matPend1 = await inv(
    cid,
    c.B77777777.id,
    provNum(),
    "RECEIVED",
    d(2026, 3, 2),
    11890.0,
    "PENDING",
    30
  );
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026, 3, 12), 9450.0, "PENDING", 30);

  // Envases — 5
  const env1 = await inv(
    cid,
    c.A88888888.id,
    provNum(),
    "RECEIVED",
    d(2026, 1, 10),
    2340.5,
    "PAID",
    45
  );
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026, 1, 25), 3150.0, "PAID", 45);
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026, 2, 8), 1870.0, "PAID", 45);
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026, 2, 22), 2890.0, "PENDING", 45);
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026, 3, 5), 1560.0, "PENDING", 45);

  // Transportes — 5 all PAID
  for (const [day, amt] of [
    [5, 890],
    [15, 1230],
    [25, 670],
    [10, 1540],
    [20, 980],
  ] as const) {
    const m = provCounter < 16 ? 1 : provCounter < 19 ? 2 : 3;
    await inv(cid, c.B99999999.id, provNum(), "RECEIVED", d(2026, m, day), amt, "PAID", 30);
  }

  // Asesoría — 3 all PAID
  await inv(cid, c.B10101010.id, provNum(), "RECEIVED", d(2026, 1, 15), 1210.0, "PAID", 15);
  await inv(cid, c.B10101010.id, provNum(), "RECEIVED", d(2026, 2, 15), 1089.0, "PAID", 15);
  await inv(cid, c.B10101010.id, provNum(), "RECEIVED", d(2026, 3, 15), 1331.0, "PAID", 15);

  // Inmobiliaria (alquiler) — 3 exact 3025€
  await inv(cid, c.B12121212.id, provNum(), "RECEIVED", d(2026, 1, 1), 3025.0, "PAID", 0);
  await inv(cid, c.B12121212.id, provNum(), "RECEIVED", d(2026, 2, 1), 3025.0, "PAID", 0);
  await inv(cid, c.B12121212.id, provNum(), "RECEIVED", d(2026, 3, 1), 3025.0, "PAID", 0);

  // Vodafone — 3
  await inv(cid, c.A13131313.id, provNum(), "RECEIVED", d(2026, 1, 5), 302.5, "PAID", 0);
  await inv(cid, c.A13131313.id, provNum(), "RECEIVED", d(2026, 2, 5), 302.5, "PAID", 0);
  await inv(cid, c.A13131313.id, provNum(), "RECEIVED", d(2026, 3, 5), 302.5, "PAID", 0);

  // Endesa — 3
  await inv(cid, c.A14141414.id, provNum(), "RECEIVED", d(2026, 1, 10), 423.5, "PAID", 0);
  await inv(cid, c.A14141414.id, provNum(), "RECEIVED", d(2026, 2, 10), 387.2, "PAID", 0);
  await inv(cid, c.A14141414.id, provNum(), "RECEIVED", d(2026, 3, 10), 456.3, "PENDING", 0);

  // Grupo Alimentario — 2 RECEIVED
  await inv(cid, c.B15151515.id, provNum(), "RECEIVED", d(2026, 1, 20), 4500.0, "PAID", 45);
  await inv(cid, c.B15151515.id, provNum(), "RECEIVED", d(2026, 3, 8), 5800.0, "PENDING", 45);

  // Credit notes
  const cn1 = await inv(
    cid,
    c.B11111111.id,
    ncNum(),
    "CREDIT_ISSUED",
    d(2026, 2, 28),
    500.0,
    "PENDING",
    0
  );
  await prisma.invoice.update({ where: { id: cn1.id }, data: { creditNoteForId: lev1.id } });
  const cn2 = await inv(
    cid,
    c.B44444444.id,
    ncNum(),
    "CREDIT_ISSUED",
    d(2026, 3, 10),
    1200.0,
    "PENDING",
    0
  );
  await prisma.invoice.update({ where: { id: cn2.id }, data: { creditNoteForId: mercOverdue.id } });
  const cn3 = await inv(
    cid,
    c.B77777777.id,
    ncNum(),
    "CREDIT_RECEIVED",
    d(2026, 3, 5),
    800.0,
    "PENDING",
    0
  );
  await prisma.invoice.update({ where: { id: cn3.id }, data: { creditNoteForId: matPend1.id } });
  const cn4 = await inv(
    cid,
    c.A88888888.id,
    ncNum(),
    "CREDIT_RECEIVED",
    d(2026, 3, 8),
    350.0,
    "PENDING",
    0
  );
  await prisma.invoice.update({ where: { id: cn4.id }, data: { creditNoteForId: env1.id } });

  // Step 8: Bank transactions
  // Scenario 1 — exact cobros for PAID invoices
  // Jan/Feb → RECONCILED (already processed), Mar → PENDING (for engine)
  for (const i of invoices.filter((i) => i.type === "ISSUED" && i.status === "PAID")) {
    const ct = contacts.find((ct) => ct.id === i.contactId)!;
    const txDate = new Date(
      i.issueDate.getTime() + (5 + Math.floor(Math.random() * 10)) * 86400000
    );
    const txStatus = txDate.getMonth() < 2 ? "RECONCILED" : "PENDING"; // 0=Jan, 1=Feb
    addTx(
      i.totalAmount,
      txDate,
      `TRANSFERENCIA A FAVOR ${ct.name} REF ${i.number}`,
      ct.iban,
      ct.name,
      txStatus
    );
  }

  // Scenario 2 — partial cobro
  addTx(
    costaPartial.amountPaid,
    new Date(costaPartial.issueDate.getTime() + 15 * 86400000),
    `PAGO PARCIAL FRA ${costaPartial.number}`,
    IBANS.costa,
    "Supermercados Costa SL"
  );

  // Scenario 3 — grouped cobro (3 Catering invoices)
  const groupedAmount = cat1.totalAmount + cat2.totalAmount + cat3.totalAmount;
  addTx(
    groupedAmount,
    d(2026, 3, 1),
    "TRANSFERENCIA AGRUPADA CATERING BARCELONA",
    IBANS.catering,
    "Catering Barcelona SL"
  );

  // Scenario 4 — cobros with differences
  addTx(
    round(levPend1.totalAmount * 0.98),
    d(2026, 3, 12),
    "TRANSF DISTRIB LEVANTE DCTO PP",
    IBANS.levante,
    "Distribuidora Levante SL"
  );
  addTx(
    round(levPend2.totalAmount * 0.98),
    d(2026, 3, 18),
    "TRANSF DISTRIB LEVANTE MENOS DCTO",
    IBANS.levante,
    "Distribuidora Levante SL"
  );
  addTx(
    round(levPend1.totalAmount - 15),
    d(2026, 3, 14),
    "TRANSF LEVANTE COMISION BANCARIA",
    IBANS.levante,
    "Distribuidora Levante SL"
  );

  // Scenarios 5-6 — pagos for PAID received invoices
  // Jan/Feb → RECONCILED, Mar → PENDING
  for (const i of invoices.filter((i) => i.type === "RECEIVED" && i.status === "PAID")) {
    const ct = contacts.find((ct) => ct.id === i.contactId)!;
    const txDate = new Date(i.issueDate.getTime() + (3 + Math.floor(Math.random() * 7)) * 86400000);
    const txStatus = txDate.getMonth() < 2 ? "RECONCILED" : "PENDING";
    addTx(
      -i.totalAmount,
      txDate,
      `PAGO TRANSFERENCIA A ${ct.name} FRA ${i.number}`,
      ct.iban,
      ct.name,
      txStatus
    );
  }

  // Scenario 7 — recurring expenses without invoice
  for (const m of [1, 2, 3]) {
    addTx(
      -25.0,
      d(2026, m, 3),
      `COMISION MANTENIMIENTO CTA EUR ${String(m).padStart(2, "0")}/2026`,
      null,
      null
    );
    addTx(
      -(290 + Math.random() * 20),
      d(2026, m, 8),
      "RECIBO DOMICILIADO VODAFONE ESPAÑA",
      IBANS.vodafone,
      "Vodafone España SAU"
    );
    addTx(
      -(350 + Math.random() * 130),
      d(2026, m, 12),
      "RECIBO DOMICILIADO ENDESA ENERGIA",
      IBANS.endesa,
      "Endesa Energía SA"
    );
  }
  addTx(-25.0, d(2026, 1, 15), "COMISION MANTENIMIENTO CTA EUR EXTRA", null, null);
  addTx(-450.0, d(2026, 1, 20), "SEGURO RC EMPRESA MAPFRE", null, null);
  addTx(-450.0, d(2026, 3, 20), "SEGURO RC EMPRESA MAPFRE", null, null);

  // Scenario 8 — unidentified income
  addTx(2500.0, d(2026, 2, 15), "INGRESO EN EFECTIVO OFICINA 0234", null, null);
  addTx(
    750.0,
    d(2026, 2, 20),
    "TRANSFERENCIA RECIBIDA",
    "ES9876543210987654321098",
    "EMPRESA NUEVA SL"
  );
  addTx(18500.0, d(2026, 3, 8), "TRANSFERENCIA RECIBIDA REF 999", "ES5678901234567890123456", null);

  // Scenario 9 — return of cobro (pick 2 early cobros)
  const cobro1 = txs.find((t) => t.amount > 0 && t.counterpartIban === IBANS.hosteleria)!;
  addTx(
    -cobro1.amount,
    new Date(cobro1.valueDate.getTime() + 12 * 86400000),
    `DEVOLUCION RECIBO ${cobro1.concept.slice(-10)} IMPAGADO`,
    cobro1.counterpartIban,
    cobro1.counterpartName
  );
  const cobro2 = txs.find((t) => t.amount > 0 && t.counterpartIban === IBANS.mercados)!;
  addTx(
    -cobro2.amount,
    new Date(cobro2.valueDate.getTime() + 15 * 86400000),
    `DEVOLUCION RECIBO IMPAGADO`,
    cobro2.counterpartIban,
    cobro2.counterpartName
  );

  // Scenario 10 — return of pago
  const pago1 = txs.find((t) => t.amount < 0 && t.counterpartIban === IBANS.envases)!;
  addTx(
    -pago1.amount,
    new Date(pago1.valueDate.getTime() + 10 * 86400000),
    "DEVOLUCION TRANSFERENCIA ENVASES",
    pago1.counterpartIban,
    pago1.counterpartName
  );

  // Scenario 11 — internal transfers (3 pairs)
  for (const [amt, day] of [
    [10000, 5],
    [5000, 15],
    [25000, 25],
  ] as const) {
    addTx(-amt, d(2026, 2, day), "TRASPASO ENTRE CUENTAS", OWN_IBAN_2, "BBVA Cuenta operativa");
    addTx(amt, d(2026, 2, day), "TRASPASO ENTRE CUENTAS", OWN_IBAN_1, "CaixaBank Cuenta principal");
  }

  // Scenario 12 — possible duplicates (2 pairs)
  addTx(
    -3500.0,
    d(2026, 2, 10),
    "PAGO ENVASES PACKAGING FRA PROV-2026-008",
    IBANS.envases,
    "Envases y Packaging SA"
  );
  addTx(
    -3500.0,
    d(2026, 2, 11),
    "PAGO ENVASES PACKAGING FRA PROV-2026-008",
    IBANS.envases,
    "Envases y Packaging SA"
  );
  addTx(
    8000.0,
    d(2026, 3, 5),
    "COBRO HOSTELERIA DEL SUR REF MAR",
    IBANS.hosteleria,
    "Hostelería del Sur SA"
  );
  addTx(
    8000.0,
    d(2026, 3, 5),
    "COBRO HOSTELERIA SUR MARZO",
    IBANS.hosteleria,
    "Hostelería del Sur SA"
  );

  // Scenario 17 — credit note transactions
  addTx(
    -cn1.totalAmount,
    d(2026, 3, 2),
    `ABONO ${cn1.number}`,
    IBANS.levante,
    "Distribuidora Levante SL"
  );
  addTx(
    -cn2.totalAmount,
    d(2026, 3, 12),
    `ABONO ${cn2.number}`,
    IBANS.mercados,
    "Mercados Regionales SL"
  );
  addTx(
    cn3.totalAmount,
    d(2026, 3, 8),
    `ABONO ${cn3.number}`,
    IBANS.materias,
    "Materias Primas del Campo SL"
  );
  addTx(
    cn4.totalAmount,
    d(2026, 3, 10),
    `ABONO ${cn4.number}`,
    IBANS.envases,
    "Envases y Packaging SA"
  );

  // Scenario 18 — no match
  addTx(
    -7777.77,
    d(2026, 2, 18),
    "PAGO PENDIENTE CONCEPTO GENERICO",
    IBANS.materias,
    "Materias Primas del Campo SL"
  );
  addTx(
    3333.33,
    d(2026, 3, 3),
    "COBRO SIN REFERENCIA CLARA",
    IBANS.levante,
    "Distribuidora Levante SL"
  );
  addTx(
    -12345.67,
    d(2026, 3, 14),
    "PAGO PENDIENTE REF DESCONOCIDA",
    "ES0000000000000000000000",
    null
  );
  addTx(999.99, d(2026, 3, 16), "TRANSFERENCIA RECIBIDA", null, null);

  // Q4 2025 tax payments (January 2026)
  addTx(
    -3245.5,
    d(2026, 1, 20),
    "AEAT MODELO 303 LIQUIDACION 4T 2025",
    null,
    "AGENCIA TRIBUTARIA",
    "RECONCILED"
  );
  addTx(
    -1876.25,
    d(2026, 1, 20),
    "AEAT MODELO 111 RETENCIONES 4T 2025",
    null,
    "AGENCIA TRIBUTARIA",
    "RECONCILED"
  );
  addTx(
    -472.5,
    d(2026, 1, 20),
    "AEAT MODELO 115 RETENCIONES ALQUILER 4T 2025",
    null,
    "AGENCIA TRIBUTARIA",
    "RECONCILED"
  );

  // Nóminas + préstamo + SS
  for (const m of [1, 2, 3]) {
    addTx(
      -(15200 + Math.random() * 200),
      d(2026, m, 28),
      `NOMINA EMPLEADOS ${["ENE", "FEB", "MAR"][m - 1]} 2026`,
      IBANS.tgss,
      "TGSS TESORERIA GENERAL"
    );
    addTx(
      -2850.0,
      d(2026, m, 5),
      "CUOTA PRESTAMO ICO REF 123456",
      IBANS.caixaPrestamoIban,
      "CAIXABANK PRESTAMOS"
    );
    addTx(
      -(5100 + Math.random() * 100),
      d(2026, m, 29),
      `SS EMPRESA ${["ENE", "FEB", "MAR"][m - 1]} 2026`,
      IBANS.tgss,
      "TGSS TESORERIA GENERAL"
    );
  }

  // Sort txs chronologically and insert
  txs.sort((a, b) => a.valueDate.getTime() - b.valueDate.getTime());
  // Recalculate balances
  let runBal = 150000;
  for (const t of txs) {
    runBal = round(runBal + t.amount);
    t.balanceAfter = runBal;
  }

  let txIdx = 0;
  for (const t of txs) {
    await prisma.bankTransaction.create({
      data: {
        externalId: `seed_${++txIdx}`,
        valueDate: t.valueDate,
        bookingDate: t.valueDate,
        amount: round(t.amount),
        currency: "EUR",
        concept: t.concept,
        counterpartIban: t.counterpartIban,
        counterpartName: t.counterpartName,
        balanceAfter: t.balanceAfter,
        status: t.status as "PENDING",
        priority: "ROUTINE",
        companyId: cid,
      },
    });
  }

  // Step 9: Matching Rules
  await prisma.matchingRule.createMany({
    data: [
      {
        name: "Comisiones bancarias",
        type: "CONCEPT_CLASSIFY",
        origin: "MANUAL",
        status: "ACTIVE",
        priority: 5,
        isActive: true,
        timesApplied: 12,
        pattern: "COMISION MANTENIMIENTO",
        action: "classify",
        accountCode: "626",
        cashflowType: "OPERATING",
        companyId: cid,
      },
      {
        name: "Vodafone telecomunicaciones",
        type: "IBAN_CLASSIFY",
        origin: "INLINE",
        status: "ACTIVE",
        priority: 3,
        isActive: true,
        timesApplied: 8,
        counterpartIban: IBANS.vodafone,
        action: "classify",
        accountCode: "628",
        cashflowType: "OPERATING",
        companyId: cid,
      },
      {
        name: "Alquiler nave",
        type: "EXACT_AMOUNT_CONTACT",
        origin: "MANUAL",
        status: "ACTIVE",
        priority: 5,
        isActive: true,
        timesApplied: 6,
        counterpartIban: IBANS.inmobiliaria,
        minAmount: 2800,
        maxAmount: 3200,
        action: "classify",
        accountCode: "621",
        cashflowType: "OPERATING",
        companyId: cid,
      },
      {
        name: "Seguro RC Mapfre",
        type: "CONCEPT_CLASSIFY",
        origin: "MANUAL",
        status: "PAUSED",
        priority: 2,
        isActive: false,
        timesApplied: 3,
        pattern: "SEGURO.*MAPFRE",
        action: "classify",
        accountCode: "625",
        cashflowType: "OPERATING",
        companyId: cid,
      },
    ],
  });

  // Step 10: Controller Decisions (25)
  const decisionData = [];
  for (let i = 0; i < 15; i++) {
    decisionData.push(
      mkDecision(
        cid,
        userId,
        "approve",
        false,
        contacts[i % contacts.length],
        d(2026, 1 + Math.floor(i / 8), 5 + i)
      )
    );
  }
  for (let i = 0; i < 5; i++) {
    decisionData.push(mkDecision(cid, userId, "approve", true, contacts[i], d(2026, 2, 10 + i)));
  }
  for (let i = 0; i < 3; i++) {
    decisionData.push(
      mkDecision(cid, userId, "classify", true, contacts[7 + i], d(2026, 2, 15 + i))
    );
  }
  decisionData.push(mkDecision(cid, userId, "reject", true, contacts[3], d(2026, 2, 20)));
  decisionData.push(mkDecision(cid, userId, "reject", true, contacts[4], d(2026, 2, 22)));

  await prisma.controllerDecision.createMany({ data: decisionData });

  // Step 11: Learned Patterns
  await prisma.learnedPattern.createMany({
    data: [
      {
        type: "differenceReason",
        status: "SUGGESTED",
        isActive: true,
        counterpartIban: IBANS.levante,
        counterpartName: "Distribuidora Levante SL",
        predictedAction: "EARLY_PAYMENT",
        predictedReason: "EARLY_PAYMENT",
        confidence: 0.85,
        occurrences: 4,
        correctPredictions: 3,
        companyId: cid,
      },
      {
        type: "classification",
        status: "ACTIVE_SUPERVISED",
        isActive: true,
        counterpartIban: IBANS.tgss,
        counterpartName: "TGSS TESORERIA GENERAL",
        predictedAction: "classify:640",
        predictedAccount: "640",
        confidence: 0.92,
        occurrences: 8,
        correctPredictions: 7,
        supervisedApplyCount: 5,
        reviewedAt: d(2026, 3, 1),
        companyId: cid,
      },
      {
        type: "differenceReason",
        status: "PROMOTED",
        isActive: false,
        counterpartIban: IBANS.costa,
        counterpartName: "Supermercados Costa SL",
        predictedAction: "BANK_COMMISSION",
        predictedReason: "BANK_COMMISSION",
        confidence: 0.9,
        occurrences: 6,
        correctPredictions: 6,
        companyId: cid,
      },
      {
        type: "classification",
        status: "REJECTED",
        isActive: false,
        counterpartIban: "ES0000000000000000000000",
        predictedAction: "classify:629",
        predictedAccount: "629",
        confidence: 0.55,
        occurrences: 2,
        correctPredictions: 1,
        reviewedAt: d(2026, 3, 5),
        companyId: cid,
      },
    ],
  });

  // Step 12: Category Thresholds
  await prisma.categoryThreshold.createMany({
    data: [
      { category: "EXACT_MATCH", threshold: 0.88, companyId: cid },
      { category: "CLASSIFICATION", threshold: 0.93, companyId: cid },
    ],
  });

  // Step 13: Summary
  const issuedCount = invoices.filter((i) => i.type === "ISSUED").length;
  const receivedCount = invoices.filter((i) => i.type === "RECEIVED").length;
  const creditCount = invoices.filter((i) => i.type.startsWith("CREDIT")).length;

  // ── New features data ──
  await seedNewFeatures(cid, org.id, userId);

  // ── Comprehensive demo data (all pages) ──
  await seedComprehensiveDemo(cid, org.id, userId, contacts, invoices);

  console.log("\n🌱 Seed completado:");
  console.log(`   🏢 Empresa: Alimentación Mediterránea SL`);
  console.log(`   👤 Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   👥 Contactos: ${contacts.length}`);
  console.log(
    `   🧾 Facturas: ${invoices.length} (${issuedCount} emitidas, ${receivedCount} recibidas, ${creditCount} notas de crédito)`
  );
  console.log(`   🏦 Movimientos bancarios: ${txs.length}`);
  console.log(`   📏 Reglas: 4`);
  console.log(`   🧠 Patrones aprendidos: 4`);
  console.log(`   📊 Decisiones históricas: ${decisionData.length}`);
  console.log(`   📋 Asientos contables: 6`);
  console.log(`   🏭 Activos fijos: 3`);
  console.log(`   💰 Presupuesto 2026: 5 cuentas × 12 meses`);
  console.log(`\n   Para ejecutar el engine de conciliación:`);
  console.log(`   POST /api/reconciliation/run\n`);
}

// ── Helper functions ──

async function mkContact(
  companyId: string,
  name: string,
  cif: string,
  iban: string,
  type: string,
  avgPaymentDays: number
) {
  return prisma.contact.create({
    data: { name, cif, iban, type: type as "CUSTOMER", avgPaymentDays, companyId },
  });
}

async function mkInvoice(
  companyId: string,
  contactId: string,
  number: string,
  type: string,
  issueDate: Date,
  totalAmount: number,
  status: string,
  avgDays: number,
  amountPaid = 0
) {
  const dueDate = new Date(issueDate.getTime() + avgDays * 86400000);
  const isPaid = status === "PAID";
  const paid = isPaid ? totalAmount : amountPaid;
  const pending = isPaid ? 0 : round(totalAmount - paid);

  const invoice = await prisma.invoice.create({
    data: {
      number,
      type: type as "ISSUED",
      issueDate,
      dueDate: avgDays > 0 ? dueDate : null,
      totalAmount,
      netAmount: net(totalAmount),
      vatAmount: vat(totalAmount),
      currency: "EUR",
      status: status as "PENDING",
      amountPaid: paid,
      amountPending: pending,
      companyId,
      contactId,
    },
  });

  // Create InvoiceLine linked to PGC account (needed for PyG report)
  // ISSUED/CREDIT_ISSUED → 705 (Prestaciones de servicios, pygLine "1")
  // RECEIVED/CREDIT_RECEIVED → 600 (Compras de mercaderías, pygLine "4")
  const pygAccount = type.includes("ISSUED") ? "705" : "600";
  const account = await prisma.account.findFirst({
    where: { code: pygAccount, companyId },
    select: { id: true },
  });
  if (account) {
    await prisma.invoiceLine.create({
      data: {
        description: `Línea ${number}`,
        quantity: 1,
        unitPrice: net(totalAmount),
        totalAmount: net(totalAmount),
        vatRate: 0.21,
        invoiceId: invoice.id,
        accountId: account.id,
      },
    });
  }

  return invoice;
}

function mkDecision(
  companyId: string,
  uid: string,
  action: string,
  wasModified: boolean,
  contact: { name: string; cif: string | null; iban: string | null },
  date: Date
) {
  const absAmount = 1000 + Math.random() * 20000;
  const amountRange =
    absAmount < 100
      ? "0-100"
      : absAmount < 500
        ? "100-500"
        : absAmount < 5000
          ? "500-5000"
          : "5000+";
  return {
    systemProposal: action === "reject" ? "approve" : "exact_amount",
    systemConfidence: 0.85 + Math.random() * 0.1,
    controllerAction: action,
    wasModified,
    isDefinitive: true,
    counterpartName: contact.name,
    counterpartCif: contact.cif,
    counterpartIban: contact.iban,
    transactionType: Math.random() > 0.5 ? "cobro" : "pago",
    amountRange,
    bankConcept: `TRANSFERENCIA ${contact.name}`,
    dayOfMonth: date.getDate(),
    isRecurring: Math.random() > 0.7,
    createdExplicitRule: false,
    userId: uid,
    companyId,
    createdAt: date,
  };
}

async function seedNewFeatures(cid: string, orgId: string, userId: string) {
  console.log("📊 Creating accounting periods, journal entries, fixed assets, budgets...");

  // Helper: find account by code
  const acc = async (code: string) => {
    const a = await prisma.account.findFirst({ where: { code, companyId: cid } });
    if (!a) throw new Error(`Account ${code} not found`);
    return a.id;
  };

  // ── Accounting Periods (12 months of 2026) ──
  for (let month = 1; month <= 12; month++) {
    await prisma.accountingPeriod.create({
      data: {
        year: 2026,
        month,
        status: month <= 2 ? "CLOSED" : "OPEN",
        closedAt: month <= 2 ? d(2026, month + 1, 1) : null,
        closedById: month <= 2 ? userId : null,
        companyId: cid,
      },
    });
  }
  console.log("  ✅ 12 accounting periods");

  // ── Fixed Assets (3) ──
  const assets = [
    {
      name: "Maquinaria envasadora",
      cost: 25000,
      life: 120,
      asset: "213",
      dep: "681",
      accum: "281",
      monthlyDep: round(25000 / 120),
    },
    {
      name: "Equipo informático oficina",
      cost: 3600,
      life: 48,
      asset: "217",
      dep: "681",
      accum: "281",
      monthlyDep: round(3600 / 48),
    },
    {
      name: "Vehículo reparto Iveco",
      cost: 18000,
      life: 96,
      asset: "218",
      dep: "681",
      accum: "281",
      monthlyDep: round(18000 / 96),
    },
  ];

  for (const a of assets) {
    await prisma.fixedAsset.create({
      data: {
        name: a.name,
        acquisitionDate: d(2026, 1, 5),
        acquisitionCost: a.cost,
        residualValue: 0,
        usefulLifeMonths: a.life,
        depreciationMethod: "LINEAR",
        accumulatedDepreciation: round(a.monthlyDep * 2),
        netBookValue: round(a.cost - a.monthlyDep * 2),
        monthlyDepreciation: a.monthlyDep,
        lastDepreciationDate: d(2026, 2, 28),
        status: "ACTIVE",
        assetAccountId: await acc(a.asset),
        depreciationAccountId: await acc(a.dep),
        accumDepAccountId: await acc(a.accum),
        companyId: cid,
      },
    });
  }
  console.log("  ✅ 3 fixed assets");

  // ── Journal Entries (6) ──
  const depAccountId = await acc("681");
  const accumAccountId = await acc("281");
  const salaryAccountId = await acc("640");
  const resultAccountId = await acc("129");

  let entryNum = 1;

  // Entry 1: Jan depreciation (POSTED, AUTO)
  await prisma.journalEntry.create({
    data: {
      number: entryNum++,
      date: d(2026, 1, 31),
      description: "Amortización mensual enero 2026",
      type: "AUTO_DEPRECIATION",
      status: "POSTED",
      postedAt: d(2026, 2, 1),
      postedById: userId,
      companyId: cid,
      lines: {
        create: [
          {
            debit: round(assets.reduce((s, a) => s + a.monthlyDep, 0)),
            credit: 0,
            accountId: depAccountId,
          },
          {
            debit: 0,
            credit: round(assets.reduce((s, a) => s + a.monthlyDep, 0)),
            accountId: accumAccountId,
          },
        ],
      },
    },
  });

  // Entry 2: Feb depreciation (POSTED, AUTO)
  await prisma.journalEntry.create({
    data: {
      number: entryNum++,
      date: d(2026, 2, 28),
      description: "Amortización mensual febrero 2026",
      type: "AUTO_DEPRECIATION",
      status: "POSTED",
      postedAt: d(2026, 3, 1),
      postedById: userId,
      companyId: cid,
      lines: {
        create: [
          {
            debit: round(assets.reduce((s, a) => s + a.monthlyDep, 0)),
            credit: 0,
            accountId: depAccountId,
          },
          {
            debit: 0,
            credit: round(assets.reduce((s, a) => s + a.monthlyDep, 0)),
            accountId: accumAccountId,
          },
        ],
      },
    },
  });

  // Entry 3: Payroll accrual (POSTED, MANUAL)
  await prisma.journalEntry.create({
    data: {
      number: entryNum++,
      date: d(2026, 2, 28),
      description: "Nóminas febrero 2026",
      type: "MANUAL",
      status: "POSTED",
      postedAt: d(2026, 2, 28),
      postedById: userId,
      companyId: cid,
      lines: {
        create: [
          { debit: 12500, credit: 0, description: "Sueldos brutos", accountId: salaryAccountId },
          { debit: 0, credit: 12500, description: "Banco nóminas", accountId: accumAccountId },
        ],
      },
    },
  });

  // Entry 4: Month-end closing (POSTED, CLOSING)
  await prisma.journalEntry.create({
    data: {
      number: entryNum++,
      date: d(2026, 2, 28),
      description: "Cierre contable febrero 2026",
      type: "CLOSING",
      status: "POSTED",
      postedAt: d(2026, 3, 1),
      postedById: userId,
      companyId: cid,
      lines: {
        create: [
          {
            debit: 8500,
            credit: 0,
            description: "Resultado del periodo",
            accountId: resultAccountId,
          },
          { debit: 0, credit: 8500, accountId: depAccountId },
        ],
      },
    },
  });

  // Entry 5: AI-proposed depreciation Mar (DRAFT)
  await prisma.journalEntry.create({
    data: {
      number: entryNum++,
      date: d(2026, 3, 31),
      description: "Amortización mensual marzo 2026 (propuesta AI)",
      type: "AUTO_DEPRECIATION",
      status: "DRAFT",
      sourceType: "depreciation",
      companyId: cid,
      lines: {
        create: [
          {
            debit: round(assets.reduce((s, a) => s + a.monthlyDep, 0)),
            credit: 0,
            accountId: depAccountId,
          },
          {
            debit: 0,
            credit: round(assets.reduce((s, a) => s + a.monthlyDep, 0)),
            accountId: accumAccountId,
          },
        ],
      },
    },
  });

  // Entry 6: Adjustment (POSTED)
  await prisma.journalEntry.create({
    data: {
      number: entryNum++,
      date: d(2026, 2, 15),
      description: "Ajuste provisión gastos pendientes",
      type: "ADJUSTMENT",
      status: "POSTED",
      postedAt: d(2026, 2, 15),
      postedById: userId,
      companyId: cid,
      lines: {
        create: [
          { debit: 1200, credit: 0, accountId: await acc("629") },
          { debit: 0, credit: 1200, accountId: accumAccountId },
        ],
      },
    },
  });
  console.log("  ✅ 6 journal entries");

  // ── Budget (2026 annual, APPROVED) ──
  const budget = await prisma.budget.create({
    data: {
      year: 2026,
      name: "Presupuesto anual",
      status: "APPROVED",
      companyId: cid,
    },
  });

  const budgetAccounts = [
    {
      code: "700",
      amounts: [45000, 42000, 48000, 50000, 47000, 52000, 35000, 30000, 55000, 53000, 49000, 60000],
    },
    {
      code: "600",
      amounts: [25000, 23000, 27000, 28000, 26000, 29000, 20000, 18000, 30000, 29000, 27000, 33000],
    },
    { code: "621", amounts: Array(12).fill(3000) },
    { code: "628", amounts: [800, 900, 850, 750, 800, 1100, 1200, 1300, 900, 850, 800, 750] },
    { code: "640", amounts: Array(12).fill(12500) },
  ];

  for (const ba of budgetAccounts) {
    for (let month = 1; month <= 12; month++) {
      await prisma.budgetLine.create({
        data: { budgetId: budget.id, accountCode: ba.code, month, amount: ba.amounts[month - 1] },
      });
    }
  }
  console.log("  ✅ Budget 2026 (5 accounts × 12 months)");

  // ── Mark some invoices as OVERDUE for aging page ──
  const issuedInvoices = await prisma.invoice.findMany({
    where: { companyId: cid, type: "ISSUED", status: "PENDING" },
    take: 4,
    orderBy: { issueDate: "asc" },
  });

  const overdueDelays = [35, 65, 95, 120]; // days overdue
  for (let i = 0; i < Math.min(issuedInvoices.length, overdueDelays.length); i++) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - overdueDelays[i]);
    await prisma.invoice.update({
      where: { id: issuedInvoices[i].id },
      data: { status: "OVERDUE", dueDate },
    });
  }
  console.log(`  ✅ ${Math.min(issuedInvoices.length, 4)} invoices marked OVERDUE`);

  // ── Agent Runs (2) ──
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  await prisma.agentRun.create({
    data: {
      status: "COMPLETED",
      startedAt: yesterday,
      completedAt: new Date(yesterday.getTime() + 45000),
      companiesProcessed: 1,
      txsProcessed: 12,
      txsAutoExecuted: 8,
      txsToBandeja: 4,
      llmCallsTotal: 3,
      llmCostEstimate: 0.015,
      errorsCount: 0,
      organizationId: orgId,
    },
  });

  await prisma.agentRun.create({
    data: {
      status: "COMPLETED_WITH_ERRORS",
      startedAt: threeDaysAgo,
      completedAt: new Date(threeDaysAgo.getTime() + 62000),
      companiesProcessed: 1,
      txsProcessed: 8,
      txsAutoExecuted: 5,
      txsToBandeja: 2,
      llmCallsTotal: 5,
      llmCostEstimate: 0.028,
      errorsCount: 1,
      organizationId: orgId,
    },
  });
  console.log("  ✅ 2 agent runs");

  // ── Notifications (5 demo) ──
  const notifs = [
    {
      type: "DAILY_BRIEFING",
      title: "Briefing diario",
      body: "GRUPO: Alimentación Mediterránea SL facturó 48.200€ en marzo. EBITDA 12.3%. Tesorería estable en 47.254€.\n\nALERTAS: 4 facturas vencidas por 8.750€. Sin anomalías.\n\nACCIÓN HOY: Revisar 4 items en bandeja y aprobar amortización de marzo.",
    },
    {
      type: "TREASURY_ALERT",
      title: "Alerta de tesorería",
      body: "El saldo proyectado baja a 5.200€ en la semana del 14/04. Cobros esperados: 12.000€. Pagos comprometidos: 18.500€. Considerar adelantar cobros o negociar plazos.",
    },
    {
      type: "ANOMALY_DETECTED",
      title: "Anomalía: 628 Suministros",
      body: "Gasto en suministros este mes: 2.450€ (media 6 meses: 850€, z-score: 3.2). La transacción más grande: 1.800€ ENDESA — posible regularización anual.",
    },
    {
      type: "FISCAL_DEADLINE",
      title: "Vencimiento fiscal: 303",
      body: "Modelo 303 — IVA trimestral (T1 2026) — vence el 20/04/2026. IVA repercutido estimado: 8.520€. IVA soportado: 5.340€. Liquidación: 3.180€ a ingresar.",
    },
    {
      type: "OVERDUE_INVOICE",
      title: "Factura vencida: FRA-2026-003",
      body: "La factura FRA-2026-003 de Distribuciones Levante SL venció hace 95 días con un importe pendiente de 3.200€.",
    },
  ];

  for (const n of notifs) {
    await prisma.notification.create({
      data: { type: n.type as any, title: n.title, body: n.body, userId, companyId: cid },
    });
  }
  console.log("  ✅ 5 notifications");
}

async function seedComprehensiveDemo(
  cid: string,
  orgId: string,
  userId: string,
  contacts: Array<{
    id: string;
    name: string;
    cif: string | null;
    iban: string | null;
    type: string;
  }>,
  _invoices: Array<{
    id: string;
    number: string;
    type: string;
    status: string;
    totalAmount: number;
    contactId: string | null;
    issueDate: Date;
  }>
) {
  console.log("📦 Creating comprehensive demo data...");
  const p = prisma as any;

  // ── 1. Second company: Distribuciones Norte SL ──
  const company2 = await (prisma as any).company.create({
    data: {
      name: "Distribuciones Norte SL",
      cif: "B76543210",
      currency: "EUR",
      type: "SUBSIDIARY",
      autoApproveThreshold: 0.9,
      materialityThreshold: 3000,
      materialityMinor: 5,
      preAlertDays: 7,
      organizationId: orgId,
      shortName: "Dist. Norte",
      needsBusinessProfile: false,
    },
  });
  const c2id = company2.id;

  // CompanyScope for admin user
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId: orgId },
  });
  if (membership) {
    await prisma.companyScope.create({
      data: { role: "ADMIN", membershipId: membership.id, companyId: c2id },
    });
  }

  // PGC accounts for company2 (minimal set)
  const c2Accounts = [
    { code: "100", name: "Capital social", group: 1 },
    { code: "129", name: "Resultado del ejercicio", group: 1 },
    { code: "430", name: "Clientes", group: 4 },
    { code: "400", name: "Proveedores", group: 4 },
    { code: "572", name: "Bancos c/c", group: 5 },
    { code: "600", name: "Compras de mercaderías", group: 6 },
    { code: "700", name: "Ventas de mercaderías", group: 7 },
    { code: "705", name: "Prestaciones de servicios", group: 7 },
    { code: "621", name: "Arrendamientos y cánones", group: 6 },
    { code: "628", name: "Suministros", group: 6 },
    { code: "640", name: "Sueldos y salarios", group: 6 },
  ];
  for (const a of c2Accounts) {
    await prisma.account.create({
      data: {
        code: a.code,
        name: a.name,
        group: a.group,
        parentCode: a.code.length > 1 ? a.code.slice(0, -1) : null,
        companyId: c2id,
      },
    });
  }

  // Contacts for company2
  const c2Contacts = await Promise.all([
    mkContact(
      c2id,
      "Supermercados Bilbao SL",
      "B20202020",
      "ES2020202020202020202020",
      "CUSTOMER",
      30
    ),
    mkContact(
      c2id,
      "Mayorista Cantabria SL",
      "B21212121",
      "ES2121212121212121212121",
      "CUSTOMER",
      45
    ),
    mkContact(
      c2id,
      "Frigoríficos Asturias SA",
      "A22222220",
      "ES2222222022222220222222",
      "SUPPLIER",
      30
    ),
  ]);

  // Invoices for company2
  const c2Account705 = await prisma.account.findFirst({ where: { code: "705", companyId: c2id } });
  const c2Account600 = await prisma.account.findFirst({ where: { code: "600", companyId: c2id } });

  const c2Invoices = [
    {
      contactIdx: 0,
      num: "DN-2026-001",
      type: "ISSUED",
      date: d(2026, 1, 10),
      amount: 12500,
      status: "PAID",
    },
    {
      contactIdx: 0,
      num: "DN-2026-002",
      type: "ISSUED",
      date: d(2026, 2, 8),
      amount: 8900,
      status: "PAID",
    },
    {
      contactIdx: 1,
      num: "DN-2026-003",
      type: "ISSUED",
      date: d(2026, 2, 20),
      amount: 15300,
      status: "PENDING",
    },
    {
      contactIdx: 1,
      num: "DN-2026-004",
      type: "ISSUED",
      date: d(2026, 3, 5),
      amount: 7200,
      status: "PENDING",
    },
    {
      contactIdx: 2,
      num: "DN-PROV-001",
      type: "RECEIVED",
      date: d(2026, 1, 15),
      amount: 9800,
      status: "PAID",
    },
  ];

  for (const ci of c2Invoices) {
    const inv = await prisma.invoice.create({
      data: {
        number: ci.num,
        type: ci.type as "ISSUED",
        issueDate: ci.date,
        dueDate: new Date(ci.date.getTime() + 30 * 86400000),
        totalAmount: ci.amount,
        netAmount: net(ci.amount),
        vatAmount: vat(ci.amount),
        currency: "EUR",
        status: ci.status as "PENDING",
        amountPaid: ci.status === "PAID" ? ci.amount : 0,
        amountPending: ci.status === "PAID" ? 0 : ci.amount,
        companyId: c2id,
        contactId: c2Contacts[ci.contactIdx].id,
      },
    });
    const lineAccount = ci.type === "ISSUED" ? c2Account705 : c2Account600;
    if (lineAccount) {
      await prisma.invoiceLine.create({
        data: {
          description: `Línea ${ci.num}`,
          quantity: 1,
          unitPrice: net(ci.amount),
          totalAmount: net(ci.amount),
          vatRate: 0.21,
          invoiceId: inv.id,
          accountId: lineAccount.id,
        },
      });
    }
  }

  // Bank transactions for company2
  const c2OwnIban = "ES3030303030303030303030";
  await prisma.ownBankAccount.create({
    data: { iban: c2OwnIban, bankName: "Sabadell", alias: "Cuenta principal DN", companyId: c2id },
  });

  const c2Txs = [
    {
      amount: 12500,
      date: d(2026, 1, 20),
      concept: "COBRO SUPERMERCADOS BILBAO DN-2026-001",
      iban: "ES2020202020202020202020",
      name: "Supermercados Bilbao SL",
      status: "RECONCILED",
    },
    {
      amount: 8900,
      date: d(2026, 2, 18),
      concept: "COBRO SUPERMERCADOS BILBAO DN-2026-002",
      iban: "ES2020202020202020202020",
      name: "Supermercados Bilbao SL",
      status: "RECONCILED",
    },
    {
      amount: -9800,
      date: d(2026, 1, 25),
      concept: "PAGO FRIGORIFICOS ASTURIAS DN-PROV-001",
      iban: "ES2222222022222220222222",
      name: "Frigoríficos Asturias SA",
      status: "RECONCILED",
    },
    {
      amount: -3025,
      date: d(2026, 1, 1),
      concept: "RECIBO ALQUILER NAVE ENE 2026",
      iban: null,
      name: null,
      status: "RECONCILED",
    },
    {
      amount: -3025,
      date: d(2026, 2, 1),
      concept: "RECIBO ALQUILER NAVE FEB 2026",
      iban: null,
      name: null,
      status: "RECONCILED",
    },
    {
      amount: -3025,
      date: d(2026, 3, 1),
      concept: "RECIBO ALQUILER NAVE MAR 2026",
      iban: null,
      name: null,
      status: "PENDING",
    },
    {
      amount: -8500,
      date: d(2026, 2, 28),
      concept: "NOMINA EMPLEADOS FEB 2026",
      iban: null,
      name: "NOMINAS",
      status: "RECONCILED",
    },
    {
      amount: -8500,
      date: d(2026, 3, 28),
      concept: "NOMINA EMPLEADOS MAR 2026",
      iban: null,
      name: "NOMINAS",
      status: "PENDING",
    },
    {
      amount: 15300,
      date: d(2026, 3, 10),
      concept: "TRANSFERENCIA MAYORISTA CANTABRIA",
      iban: "ES2121212121212121212121",
      name: "Mayorista Cantabria SL",
      status: "PENDING",
    },
    {
      amount: -450,
      date: d(2026, 3, 15),
      concept: "RECIBO ENDESA ENERGIA MAR",
      iban: null,
      name: "Endesa Energía SA",
      status: "PENDING",
    },
  ];

  let c2Balance = 50000;
  let c2TxIdx = 0;
  for (const t of c2Txs) {
    c2Balance = round(c2Balance + t.amount);
    await prisma.bankTransaction.create({
      data: {
        externalId: `seed_c2_${++c2TxIdx}`,
        valueDate: t.date,
        bookingDate: t.date,
        amount: t.amount,
        currency: "EUR",
        concept: t.concept,
        counterpartIban: t.iban,
        counterpartName: t.name,
        balanceAfter: c2Balance,
        status: t.status as "PENDING",
        priority: "ROUTINE",
        companyId: c2id,
      },
    });
  }
  console.log(
    "  ✅ Company 2: Distribuciones Norte SL (11 accounts, 3 contacts, 5 invoices, 10 txs)"
  );

  // ── 2. Inquiries (6 records) ──
  const fourDaysAgo = new Date();
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const twentyDaysAgo = new Date();
  twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // DRAFT — factura faltante
  await p.inquiry.create({
    data: {
      triggerType: "MISSING_INVOICE",
      contactId: contacts[0].id,
      recipientEmail: "admin@distribuidoralevante.es",
      recipientName: contacts[0].name,
      subject: "Solicitud de factura — Pago de 8.500€ del 14/03/2026",
      body: "<p>Estimados,</p><p>Hemos registrado un pago de 8.500€ el 14/03/2026 pero no disponemos de la factura correspondiente. ¿Podrían enviárnosla?</p><p>Gracias,<br/>Alimentación Mediterránea SL</p>",
      bodyPlain:
        "Estimados, hemos registrado un pago de 8.500€ el 14/03/2026 pero no disponemos de la factura correspondiente. ¿Podrían enviárnosla? Gracias, Alimentación Mediterránea SL",
      status: "DRAFT",
      companyId: cid,
    },
  });

  // SENT — enviado hace 4 días
  await p.inquiry.create({
    data: {
      triggerType: "MISSING_DOCUMENTATION",
      contactId: contacts[6].id, // Materias Primas
      recipientEmail: "facturacion@materiasprimas.es",
      recipientName: contacts[6].name,
      subject: "Documentación pendiente — Albarán entrega 02/03/2026",
      body: "<p>Estimados,</p><p>Necesitamos el albarán de entrega correspondiente al pedido del 02/03/2026 por 11.890€ para completar la conciliación.</p>",
      bodyPlain:
        "Estimados, necesitamos el albarán de entrega correspondiente al pedido del 02/03/2026 por 11.890€ para completar la conciliación.",
      status: "SENT",
      sentAt: fourDaysAgo,
      sentMessageId: "msg_demo_001@mail.concilia.es",
      sentThreadId: "thread_demo_001",
      nextFollowUpDate: new Date(fourDaysAgo.getTime() + 3 * 86400000),
      followUpIntervalDays: 3,
      companyId: cid,
    },
  });

  // RESPONSE_RECEIVED — con responseSummary
  await p.inquiry.create({
    data: {
      triggerType: "EXPENSE_CLARIFICATION",
      contactId: contacts[7].id, // Envases y Packaging
      recipientEmail: "contabilidad@envases.es",
      recipientName: contacts[7].name,
      subject: "Aclaración cargo duplicado — 3.500€ del 10/02/2026",
      body: "<p>Estimados,</p><p>Hemos detectado un cargo duplicado de 3.500€ los días 10 y 11 de febrero. ¿Podrían confirmar si se trata de un error?</p>",
      bodyPlain:
        "Estimados, hemos detectado un cargo duplicado de 3.500€ los días 10 y 11 de febrero. ¿Podrían confirmar si se trata de un error?",
      status: "RESPONSE_RECEIVED",
      sentAt: tenDaysAgo,
      sentMessageId: "msg_demo_002@mail.concilia.es",
      sentThreadId: "thread_demo_002",
      responseReceivedAt: new Date(tenDaysAgo.getTime() + 2 * 86400000),
      responseMessageId: "msg_resp_002@envases.es",
      responseSummary:
        "Confirman que el segundo cargo del 11/02 fue un error. Emitirán nota de crédito por 3.500€ esta semana.",
      responseResolved: false,
      proposedAction: "CLOSE_WITH_NOTE",
      proposedActionReason:
        "El proveedor confirma duplicado y emitirá NC. Pendiente de recibir la NC.",
      companyId: cid,
    },
  });

  // FOLLOW_UP_DRAFT — followUpNumber: 2
  await p.inquiry.create({
    data: {
      triggerType: "MISSING_INVOICE",
      contactId: contacts[3].id, // Mercados Regionales
      recipientEmail: "admin@mercadosregionales.es",
      recipientName: contacts[3].name,
      subject: "RE: Solicitud de factura — Cobro pendiente 6.200€",
      body: "<p>Estimados,</p><p>Segundo recordatorio: seguimos a la espera de la factura correspondiente al cobro de 6.200€. Necesitamos la documentación para cerrar la conciliación.</p>",
      bodyPlain:
        "Estimados, segundo recordatorio: seguimos a la espera de la factura correspondiente al cobro de 6.200€. Necesitamos la documentación para cerrar la conciliación.",
      status: "FOLLOW_UP_DRAFT",
      sentAt: twentyDaysAgo,
      sentMessageId: "msg_demo_003@mail.concilia.es",
      sentThreadId: "thread_demo_003",
      followUpNumber: 2,
      maxFollowUps: 3,
      nextFollowUpDate: twoDaysAgo,
      followUpIntervalDays: 5,
      proposedFollowUpBody: "<p>Tercer y último recordatorio antes de escalación...</p>",
      companyId: cid,
    },
  });

  // ESCALATED — followUpNumber: 3, maxFollowUps reached
  await p.inquiry.create({
    data: {
      triggerType: "MISSING_INVOICE",
      contactId: contacts[4].id, // Exportadora Ibérica
      recipientEmail: "contabilidad@exportadoraiberica.es",
      recipientName: contacts[4].name,
      subject: "URGENTE: Documentación pendiente — Factura 48.500€",
      body: "<p>Estimados,</p><p>Tras tres intentos de contacto sin respuesta, escalamos esta solicitud. Necesitamos la factura correspondiente a la transferencia de 48.500€ del 10/02/2026.</p>",
      bodyPlain:
        "Estimados, tras tres intentos de contacto sin respuesta, escalamos esta solicitud. Necesitamos la factura correspondiente a la transferencia de 48.500€ del 10/02/2026.",
      status: "ESCALATED",
      sentAt: thirtyDaysAgo,
      sentMessageId: "msg_demo_004@mail.concilia.es",
      sentThreadId: "thread_demo_004",
      followUpNumber: 3,
      maxFollowUps: 3,
      tone: "URGENT",
      companyId: cid,
    },
  });

  // RESOLVED — responseResolved: true
  await p.inquiry.create({
    data: {
      triggerType: "IC_CONFIRMATION",
      contactId: contacts[13].id, // Grupo Alimentario Norte
      recipientEmail: "contabilidad@grupoalimentario.es",
      recipientName: contacts[13].name,
      subject: "Confirmación operación intercompañía — 8.400€",
      body: "<p>Estimados,</p><p>Solicitamos confirmación de la operación intercompañía por 8.400€ (FRA-2026-039) registrada el 15/01/2026.</p>",
      bodyPlain:
        "Estimados, solicitamos confirmación de la operación intercompañía por 8.400€ (FRA-2026-039) registrada el 15/01/2026.",
      status: "RESOLVED",
      sentAt: twentyDaysAgo,
      sentMessageId: "msg_demo_005@mail.concilia.es",
      sentThreadId: "thread_demo_005",
      responseReceivedAt: new Date(twentyDaysAgo.getTime() + 1 * 86400000),
      responseMessageId: "msg_resp_005@grupoalimentario.es",
      responseSummary:
        "Confirman la operación intercompañía. Adjuntan factura de compra correspondiente.",
      responseResolved: true,
      attachmentsReceived: 1,
      companyId: cid,
    },
  });
  console.log(
    "  ✅ 6 inquiries (DRAFT, SENT, RESPONSE_RECEIVED, FOLLOW_UP_DRAFT, ESCALATED, RESOLVED)"
  );

  // ── 3. Supporting Documents (5 records) ──
  await p.supportingDocument.create({
    data: {
      type: "MODELO_FISCAL",
      reference: "303-T4-2025",
      description: "Pago Modelo 303 IVA T4 2025",
      date: d(2026, 1, 20),
      amount: 3245.5,
      debitAccountCode: "4750",
      creditAccountCode: "572",
      cashflowType: "OPERATING",
      expectedDirection: "OUTFLOW",
      status: "POSTED",
      companyId: cid,
    },
  });

  await p.supportingDocument.create({
    data: {
      type: "ACTA_JUNTA",
      reference: "ACTA-2025-12",
      description: "Acta Junta General Ordinaria — Aprobación cuentas 2025",
      date: d(2026, 1, 15),
      amount: 0,
      debitAccountCode: "129",
      creditAccountCode: "120",
      cashflowType: "NON_CASH",
      expectedDirection: "NONE",
      status: "REGISTERED",
      companyId: cid,
    },
  });

  await p.supportingDocument.create({
    data: {
      type: "RECIBO_NOMINA",
      reference: "NOM-2026-02",
      description: "Nóminas empleados febrero 2026",
      date: d(2026, 2, 28),
      amount: 15200,
      debitAccountCode: "640",
      creditAccountCode: "572",
      cashflowType: "OPERATING",
      expectedDirection: "OUTFLOW",
      status: "RECONCILED",
      companyId: cid,
    },
  });

  await p.supportingDocument.create({
    data: {
      type: "CONTRATO_ALQUILER",
      reference: "ALQ-NAVE-2024",
      description: "Contrato alquiler nave industrial — Inmobiliaria Nave Central SL",
      date: d(2024, 6, 1),
      amount: 3025,
      contactId: contacts[10].id, // Inmobiliaria
      debitAccountCode: "621",
      creditAccountCode: "572",
      cashflowType: "OPERATING",
      expectedDirection: "OUTFLOW",
      status: "POSTED",
      companyId: cid,
    },
  });

  await p.supportingDocument.create({
    data: {
      type: "POLIZA_SEGURO",
      reference: "SEG-RC-2026",
      description: "Póliza seguro RC empresa — Mapfre",
      date: d(2026, 1, 1),
      amount: 900,
      debitAccountCode: "625",
      creditAccountCode: "572",
      cashflowType: "OPERATING",
      expectedDirection: "OUTFLOW",
      status: "POSTED",
      companyId: cid,
    },
  });
  console.log("  ✅ 5 supporting documents");

  // ── 4. Recurring Accruals (3 records) ──
  await p.recurringAccrual.create({
    data: {
      description: "Seguro RC anual — Mapfre",
      totalAnnualAmount: 3600,
      monthlyAmount: 300,
      expenseAccountCode: "625",
      accrualAccountCode: "480",
      frequency: "MONTHLY",
      startDate: d(2026, 1, 1),
      autoReverse: true,
      status: "ACTIVE",
      lastAccruedDate: d(2026, 2, 28),
      totalAccrued: 600,
      companyId: cid,
    },
  });

  await p.recurringAccrual.create({
    data: {
      description: "Auditoría anual — Ernst & Young",
      totalAnnualAmount: 6000,
      monthlyAmount: 500,
      expenseAccountCode: "623",
      accrualAccountCode: "480",
      frequency: "MONTHLY",
      startDate: d(2026, 1, 1),
      autoReverse: true,
      status: "ACTIVE",
      lastAccruedDate: d(2026, 2, 28),
      totalAccrued: 1000,
      companyId: cid,
    },
  });

  await p.recurringAccrual.create({
    data: {
      description: "Mantenimiento IT — Soporte anual servidores",
      totalAnnualAmount: 2400,
      monthlyAmount: 200,
      expenseAccountCode: "629",
      accrualAccountCode: "480",
      frequency: "MONTHLY",
      startDate: d(2026, 1, 1),
      autoReverse: true,
      status: "ACTIVE",
      lastAccruedDate: d(2026, 2, 28),
      totalAccrued: 400,
      companyId: cid,
    },
  });
  console.log("  ✅ 3 recurring accruals");

  // ── 5. Investments (2 records) ──
  await p.investment.create({
    data: {
      name: "Participación TechFood SL",
      type: "EQUITY_OTHER",
      pgcAccount: "250",
      acquisitionDate: d(2025, 6, 15),
      acquisitionCost: 25000,
      ownershipPct: 5,
      status: "ACTIVE",
      valuationMethod: "COST",
      notes: "Participación minoritaria en startup de food-tech",
      companyId: cid,
    },
  });

  await p.investment.create({
    data: {
      name: "Préstamo concedido a socio — Juan García",
      type: "LOAN_GRANTED",
      pgcAccount: "252",
      acquisitionDate: d(2025, 3, 1),
      acquisitionCost: 50000,
      status: "ACTIVE",
      valuationMethod: "COST",
      currentValue: 45000,
      lastValuationDate: d(2026, 2, 28),
      notes: "Préstamo a 5 años, amortización semestral 5.000€",
      companyId: cid,
    },
  });
  console.log("  ✅ 2 investments");

  // ── 6. Debt Instruments (3 records + schedule) ──
  const icoLoan = await p.debtInstrument.create({
    data: {
      name: "Préstamo ICO Inversión 2024",
      type: "TERM_LOAN",
      bankEntityName: "Santander",
      principalAmount: 120000,
      outstandingBalance: 108000,
      interestRateType: "FIXED",
      interestRateValue: 3.5,
      startDate: d(2024, 1, 15),
      maturityDate: d(2029, 1, 15),
      paymentFrequency: "MONTHLY",
      paymentDay: 5,
      status: "ACTIVE",
      companyId: cid,
    },
  });

  // 12 schedule entries (next 12 months)
  for (let i = 1; i <= 12; i++) {
    const dueDate = new Date(2026, i - 1, 5);
    await p.debtScheduleEntry.create({
      data: {
        debtInstrumentId: icoLoan.id,
        entryNumber: 24 + i,
        dueDate,
        principalAmount: 1800,
        interestAmount: 315,
        totalAmount: 2115,
        outstandingAfter: 108000 - 1800 * i,
        matched: i <= 3, // first 3 months already paid
      },
    });
  }

  await p.debtInstrument.create({
    data: {
      name: "Póliza de crédito CaixaBank",
      type: "REVOLVING_CREDIT",
      bankEntityName: "CaixaBank",
      principalAmount: 200000,
      outstandingBalance: 80000,
      interestRateType: "VARIABLE",
      interestRateValue: 1.5,
      referenceRate: "EURIBOR_12M",
      spread: 1.5,
      startDate: d(2025, 6, 1),
      maturityDate: d(2026, 6, 1),
      paymentFrequency: "QUARTERLY",
      creditLimit: 200000,
      currentDrawdown: 80000,
      status: "ACTIVE",
      companyId: cid,
    },
  });

  const leasing = await p.debtInstrument.create({
    data: {
      name: "Leasing furgoneta Iveco Daily",
      type: "FINANCE_LEASE",
      bankEntityName: "BBVA Leasing",
      principalAmount: 28000,
      outstandingBalance: 21000,
      interestRateType: "FIXED",
      interestRateValue: 4.2,
      startDate: d(2025, 1, 15),
      maturityDate: d(2029, 1, 15),
      paymentFrequency: "MONTHLY",
      paymentDay: 15,
      status: "ACTIVE",
      notes: "Opción de compra: 1.400€ (5%)",
      companyId: cid,
    },
  });

  // 6 schedule entries for leasing (next 6 months)
  for (let i = 1; i <= 6; i++) {
    const dueDate = new Date(2026, i - 1, 15);
    await p.debtScheduleEntry.create({
      data: {
        debtInstrumentId: leasing.id,
        entryNumber: 12 + i,
        dueDate,
        principalAmount: 486,
        interestAmount: 98,
        totalAmount: 584,
        outstandingAfter: 21000 - 486 * i,
        matched: i <= 2,
      },
    });
  }
  console.log(
    "  ✅ 3 debt instruments (ICO loan + 12 schedule, revolving credit, leasing + 6 schedule)"
  );

  // ── 7. IntercompanyLink (2 records) ──
  await prisma.intercompanyLink.create({
    data: {
      organizationId: orgId,
      companyAId: cid,
      companyBId: c2id,
      amount: 15000,
      date: d(2026, 2, 15),
      concept: "Factura servicios distribución T1 2026",
      status: "CONFIRMED",
      matchedAt: d(2026, 2, 15),
    },
  });

  await prisma.intercompanyLink.create({
    data: {
      organizationId: orgId,
      companyAId: cid,
      companyBId: c2id,
      amount: 30000,
      date: d(2026, 1, 10),
      concept: "Préstamo intercompañía — financiación circulante",
      status: "DETECTED",
    },
  });
  console.log("  ✅ 2 intercompany links");

  // ── 8. GestoriaConfig (1 record) ──
  await p.gestoriaConfig.create({
    data: {
      companyId: cid,
      gestoriaName: "Asesoría Fiscal López SL",
      contactName: "María López",
      phone: "+34 93 456 78 90",
      email: "gestoria@asesorialopez.es",
      accessLevel: "reportes",
      manages: ["fiscal", "laboral"],
    },
  });
  console.log("  ✅ 1 gestoría config");

  // ── 9. BusinessProfile (1 record) ──
  await p.businessProfile.create({
    data: {
      companyId: cid,
      sector: "food_beverage",
      actividad: "Importación y distribución de alimentación premium",
      canales: ["b2b_directo", "distribuidores"],
      regimenIva: "general",
      modeloIngreso: "venta_producto",
      modulosFiscales: ["303", "111", "200", "347"],
      inferredAt: d(2026, 1, 2),
    },
  });

  // Set needsBusinessProfile = false
  await (prisma as any).company.update({
    where: { id: cid },
    data: { needsBusinessProfile: false },
  });
  console.log("  ✅ 1 business profile");

  // ── 10. BadDebtTracker (2 records) ──
  // Find overdue invoices
  const overdueInvoices = await prisma.invoice.findMany({
    where: { companyId: cid, type: "ISSUED", status: "OVERDUE" },
    take: 2,
    orderBy: { issueDate: "asc" },
  });

  if (overdueInvoices.length >= 1) {
    await p.badDebtTracker.create({
      data: {
        invoiceId: overdueInvoices[0].id,
        overdueDate: d(2025, 12, 15),
        overdueMonths: 3,
        provisionAmount: overdueInvoices[0].totalAmount,
        status: "MONITORING",
        companyId: cid,
      },
    });
  }

  if (overdueInvoices.length >= 2) {
    await p.badDebtTracker.create({
      data: {
        invoiceId: overdueInvoices[1].id,
        overdueDate: d(2025, 10, 1),
        overdueMonths: 6,
        provisionAmount: overdueInvoices[1].totalAmount,
        claimType: "JUDICIAL",
        claimDate: d(2026, 2, 1),
        claimReference: "PROC-2026-00142",
        isTaxDeductible: true,
        taxDeductibleDate: d(2026, 2, 1),
        status: "PROVISION_TAX",
        companyId: cid,
      },
    });
  }
  console.log(`  ✅ ${Math.min(overdueInvoices.length, 2)} bad debt trackers`);

  // ── 11. Reconciliation records (~18) ──
  // Link RECONCILED bank transactions to matching invoices
  const reconciledTxs = await prisma.bankTransaction.findMany({
    where: { companyId: cid, status: "RECONCILED" },
    orderBy: { valueDate: "asc" },
  });

  const paidInvoices = await prisma.invoice.findMany({
    where: { companyId: cid, status: "PAID" },
    orderBy: { issueDate: "asc" },
  });

  let reconCount = 0;
  for (const tx of reconciledTxs) {
    // Match by amount: positive tx → ISSUED invoices, negative → RECEIVED
    const isIncome = tx.amount > 0;
    const matchInvoice = paidInvoices.find((inv) => {
      const amountMatch = isIncome
        ? Math.abs(inv.totalAmount - tx.amount) < 0.01
        : Math.abs(inv.totalAmount - Math.abs(tx.amount)) < 0.01;
      const typeMatch = isIncome ? inv.type === "ISSUED" : inv.type === "RECEIVED";
      return amountMatch && typeMatch;
    });

    if (matchInvoice) {
      // Remove from pool to avoid duplicates
      const idx = paidInvoices.indexOf(matchInvoice);
      paidInvoices.splice(idx, 1);

      await prisma.reconciliation.create({
        data: {
          type: "EXACT_MATCH",
          confidenceScore: 0.95 + Math.random() * 0.05,
          matchReason: `Coincidencia exacta: ${matchInvoice.number} = ${Math.abs(tx.amount).toFixed(2)}€`,
          status: "AUTO_APPROVED",
          invoiceAmount: matchInvoice.totalAmount,
          bankAmount: Math.abs(tx.amount),
          difference: 0,
          resolvedAt: tx.valueDate,
          resolvedById: userId,
          resolution: "auto_approved",
          bankTransactionId: tx.id,
          invoiceId: matchInvoice.id,
          companyId: cid,
        },
      });
      reconCount++;
    }

    if (reconCount >= 18) break;
  }
  console.log(`  ✅ ${reconCount} reconciliation records`);

  console.log("📦 Comprehensive demo data completado.");

  // ── 12. Agent Threads ──
  await seedAgentThreads(cid, orgId, contacts);
}

// ── seedAgentThreads — 8 threads (one per scenario) with realistic messages ──

async function seedAgentThreads(
  cid: string,
  orgId: string,
  contacts: Array<{
    id: string;
    name: string;
    email?: string | null;
    accountingEmail?: string | null;
  }>
) {
  const p = prisma as any;

  // Idempotency: check if threads already exist
  const existingThreads =
    (await p.agentThread?.count?.({ where: { companyId: cid } }).catch(() => 0)) ?? 0;
  if (existingThreads > 0) {
    console.log(`  ⏭️  AgentThreads already seeded (${existingThreads})`);
    return;
  }

  const levante = contacts.find((c) => c.name.includes("Levante")) ?? contacts[0];
  const costa = contacts.find((c) => c.name.includes("Costa")) ?? contacts[1];
  const hosteleria = contacts.find((c) => c.name.includes("Hostelería")) ?? contacts[2];
  const mercados = contacts.find((c) => c.name.includes("Mercados")) ?? contacts[3];
  const exportadora = contacts.find((c) => c.name.includes("Exportadora")) ?? contacts[4];
  const transportes = contacts.find((c) => c.name.includes("Transportes")) ?? contacts[5];
  const envases = contacts.find((c) => c.name.includes("Envases")) ?? contacts[6];
  const asesoria = contacts.find((c) => c.name.includes("Asesoría")) ?? contacts[7];

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  // Helper to create thread + messages in one go
  async function createThread(data: {
    scenario: string;
    status: string;
    priority: string;
    subject: string;
    summary: string;
    blockedReason?: string;
    contactId?: string;
    externalEmail?: string;
    externalName?: string;
    followUpCount: number;
    nextFollowUpAt?: Date;
    lastFollowUpAt?: Date;
    resolvedAt?: Date;
    autoResolved?: boolean;
    dueDate?: Date;
    lastActivityAt: Date;
    supportingDocUrls?: string[];
    messages: Array<{
      role: string;
      channel: string;
      content: string;
      contentHtml?: string;
      channelMeta?: object;
      suggestedActions?: unknown[];
      actionTaken?: string;
      attachmentUrls?: string[];
      attachmentNames?: string[];
      createdAt: Date;
    }>;
  }) {
    const thread = await p.agentThread.create({
      data: {
        companyId: cid,
        organizationId: orgId,
        scenario: data.scenario,
        status: data.status,
        priority: data.priority,
        subject: data.subject,
        summary: data.summary,
        blockedReason: data.blockedReason ?? null,
        contactId: data.contactId ?? null,
        externalEmail: data.externalEmail ?? null,
        externalName: data.externalName ?? null,
        followUpCount: data.followUpCount,
        nextFollowUpAt: data.nextFollowUpAt ?? null,
        lastFollowUpAt: data.lastFollowUpAt ?? null,
        resolvedAt: data.resolvedAt ?? null,
        autoResolved: data.autoResolved ?? false,
        dueDate: data.dueDate ?? null,
        lastActivityAt: data.lastActivityAt,
        supportingDocUrls: data.supportingDocUrls ?? [],
        followUpPolicy: {
          intervalDays: 4,
          maxAttempts: 3,
          toneProgression: ["friendly", "firm", "formal"],
        },
        autoResolveCondition: { type: "invoice_paid" },
      },
    });

    for (const msg of data.messages) {
      await p.threadMessage.create({
        data: {
          threadId: thread.id,
          role: msg.role,
          channel: msg.channel,
          content: msg.content,
          contentHtml: msg.contentHtml ?? null,
          channelMeta: msg.channelMeta ?? {},
          suggestedActions: msg.suggestedActions ?? null,
          actionTaken: msg.actionTaken ?? null,
          attachmentUrls: msg.attachmentUrls ?? [],
          attachmentNames: msg.attachmentNames ?? [],
          createdAt: msg.createdAt,
        },
      });
    }
    return thread;
  }

  // Thread 1: OVERDUE_RECEIVABLE — 3 follow-ups, WAITING_CONTROLLER
  await createThread({
    scenario: "OVERDUE_RECEIVABLE",
    status: "WAITING_CONTROLLER",
    priority: "HIGH",
    supportingDocUrls: ["/facturas?search=FRA-2026-016"],
    subject: `Cobro pendiente FRA-2026-012 — ${levante?.name ?? "Distribuciones Levante"} (4.235,00 EUR)`,
    summary: "3 follow-ups enviados sin respuesta. El contacto no ha respondido a ningún email.",
    blockedReason:
      "3 intentos sin respuesta. Requiere decisión: enviar uno más, provisionar o cerrar.",
    contactId: levante?.id,
    externalEmail: levante?.accountingEmail ?? levante?.email ?? "admin@levante.es",
    externalName: levante?.name ?? "Distribuciones Levante",
    followUpCount: 3,
    lastFollowUpAt: daysAgo(2),
    dueDate: daysAgo(45),
    lastActivityAt: daysAgo(2),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Hilo creado: OVERDUE_RECEIVABLE. Factura FRA-2026-012 vencida hace 45 días. Importe: 4.235,00 EUR.",
        createdAt: daysAgo(14),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nNos ponemos en contacto en relación con la factura FRA-2026-012 por importe de 4.235,00 EUR, con vencimiento el pasado 8 de febrero.\n\nLes rogamos procedan al abono a la mayor brevedad posible. Quedamos a su disposición.\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: { to: "admin@levante.es", subject: "Recordatorio de pago — FRA-2026-012" },
        createdAt: daysAgo(14),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nEn relación con nuestro email del 11 de marzo, le recordamos que la factura FRA-2026-012 (4.235,00 EUR) continúa pendiente de cobro.\n\n¿Podrían confirmar la fecha prevista de pago, por favor?\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: { to: "admin@levante.es", subject: "Re: Recordatorio de pago — FRA-2026-012" },
        createdAt: daysAgo(10),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nEs la tercera vez que nos ponemos en contacto. La factura FRA-2026-012 acumula 45 días de retraso. Si no recibimos respuesta en 5 días hábiles, nos veremos obligados a provisionar contablemente la deuda.\n\nQuedamos a su disposición.\n\nDepartamento de Administración",
        channelMeta: { to: "admin@levante.es", subject: "URGENTE: Factura pendiente FRA-2026-012" },
        createdAt: daysAgo(6),
      },
      {
        role: "SYSTEM",
        channel: "APP",
        content: "Máximo de 3 follow-ups alcanzado. Escalado al controller.",
        suggestedActions: [
          { type: "extend_followup", label: "Enviar 1 más" },
          { type: "close", label: "Cerrar sin resolución" },
          { type: "provision_bad_debt", label: "Provisionar como dudoso cobro" },
        ],
        createdAt: daysAgo(2),
      },
    ],
  });

  // Thread 2: OVERDUE_RECEIVABLE — RESOLVED (autoResolved, payment found)
  await createThread({
    scenario: "OVERDUE_RECEIVABLE",
    status: "RESOLVED",
    priority: "MEDIUM",
    subject: `Cobro pendiente FRA-2026-008 — ${costa?.name ?? "Costa Distribución"} (1.850,00 EUR)`,
    summary: "Pago recibido. Factura cobrada tras 1 follow-up.",
    contactId: costa?.id,
    externalEmail: costa?.accountingEmail ?? costa?.email ?? "contabilidad@costa.es",
    externalName: costa?.name ?? "Costa Distribución",
    followUpCount: 1,
    lastFollowUpAt: daysAgo(8),
    resolvedAt: daysAgo(3),
    autoResolved: true,
    dueDate: daysAgo(20),
    lastActivityAt: daysAgo(3),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Hilo creado: OVERDUE_RECEIVABLE. Factura FRA-2026-008 vencida hace 20 días. Importe: 1.850,00 EUR.",
        createdAt: daysAgo(12),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nLe recordamos que la factura FRA-2026-008 por 1.850,00 EUR venció el pasado 5 de marzo.\n\nLes rogamos confirmen la fecha de pago.\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: {
          to: "contabilidad@costa.es",
          subject: "Recordatorio de pago — FRA-2026-008",
        },
        createdAt: daysAgo(8),
      },
      {
        role: "EXTERNAL",
        channel: "EMAIL",
        content:
          "Buenos días,\n\nDisculpen el retraso. Hemos realizado la transferencia esta mañana. Referencia: TR-20260322-1850.\n\nSaludos,\nContabilidad Costa Distribución",
        createdAt: daysAgo(5),
      },
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Respuesta procesada: El contacto confirma pago realizado. Referencia: TR-20260322-1850. Acción: wait_and_verify.",
        createdAt: daysAgo(5),
      },
      {
        role: "SYSTEM",
        channel: "APP",
        content: "Hilo auto-resuelto: Todas las facturas cobradas (1)",
        createdAt: daysAgo(3),
      },
    ],
  });

  // Thread 3: DUPLICATE_OR_OVERPAYMENT — AGENT_WORKING
  await createThread({
    scenario: "DUPLICATE_OR_OVERPAYMENT",
    status: "AGENT_WORKING",
    priority: "HIGH",
    subject: `Posible sobrepago — ${hosteleria?.name ?? "Hostelería del Sur"} (duplicado 2.100,00 EUR)`,
    summary: "Detectado cobro duplicado. Email inicial enviado al contacto.",
    contactId: hosteleria?.id,
    externalEmail: hosteleria?.accountingEmail ?? hosteleria?.email ?? "admin@hosteleria.es",
    externalName: hosteleria?.name ?? "Hostelería del Sur",
    followUpCount: 1,
    lastFollowUpAt: daysAgo(1),
    nextFollowUpAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    lastActivityAt: daysAgo(1),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Hilo creado: DUPLICATE_OR_OVERPAYMENT. Cobro de 2.100,00 EUR recibido dos veces del mismo cliente.",
        createdAt: daysAgo(2),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nHemos detectado que hemos recibido dos cobros de 2.100,00 EUR con fecha 23 de marzo. ¿Podrían confirmar si se trata de un pago duplicado?\n\nEn caso afirmativo, procederemos a la devolución.\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: {
          to: "admin@hosteleria.es",
          subject: "Consulta: posible cobro duplicado — 2.100,00 EUR",
        },
        createdAt: daysAgo(1),
      },
    ],
  });

  // Thread 4: SUPPLIER_DISCREPANCY — WAITING_CONTROLLER with external reply
  await createThread({
    scenario: "SUPPLIER_DISCREPANCY",
    status: "WAITING_CONTROLLER",
    priority: "MEDIUM",
    supportingDocUrls: ["/facturas?search=PROV-2026-001"],
    subject: `Discrepancia proveedor PROV-2026-045 — ${mercados?.name ?? "Mercados Centrales"} (diferencia 127,50 EUR)`,
    summary:
      "El proveedor indica que la diferencia corresponde a un recargo por entrega urgente no facturado.",
    blockedReason: "El proveedor explica la diferencia como recargo urgente. ¿Aceptar o disputar?",
    contactId: mercados?.id,
    externalEmail: mercados?.accountingEmail ?? mercados?.email ?? "facturas@mercados.es",
    externalName: mercados?.name ?? "Mercados Centrales",
    followUpCount: 1,
    lastFollowUpAt: daysAgo(4),
    lastActivityAt: daysAgo(1),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Hilo creado: SUPPLIER_DISCREPANCY. Factura PROV-2026-045 por 3.427,50 EUR — pagada 3.300,00 EUR. Diferencia: 127,50 EUR.",
        createdAt: daysAgo(5),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nHemos detectado una diferencia de 127,50 EUR entre la factura PROV-2026-045 (3.427,50 EUR) y el pago realizado (3.300,00 EUR).\n\nLes rogamos nos aclaren el motivo de esta diferencia.\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: {
          to: "facturas@mercados.es",
          subject: "Aclaración diferencia factura PROV-2026-045",
        },
        createdAt: daysAgo(4),
      },
      {
        role: "EXTERNAL",
        channel: "EMAIL",
        content:
          "Buenos días,\n\nLa diferencia de 127,50 EUR corresponde al recargo por entrega urgente del pedido del día 15. Enviamos factura complementaria adjunta.\n\nSaludos,\nDpto. Facturación Mercados Centrales",
        attachmentUrls: ["/facturas?search=PROV-2026-001"],
        attachmentNames: ["Factura_PROV-2026-001_corregida.pdf"],
        createdAt: daysAgo(1),
      },
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Respuesta procesada: El proveedor explica diferencia como recargo urgente. Factura complementaria prometida.",
        createdAt: daysAgo(1),
      },
      {
        role: "SYSTEM",
        channel: "APP",
        content: "Escalado al controller: requiere decisión sobre aceptación del recargo.",
        suggestedActions: [
          { type: "close", label: "Aceptar y cerrar" },
          { type: "request_more_info", label: "Pedir la factura complementaria" },
          { type: "escalate_to_controller", label: "Disputar el recargo" },
        ],
        createdAt: daysAgo(1),
      },
    ],
  });

  // Thread 5: MISSING_FISCAL_DOCS — CRITICAL, 1 follow-up
  await createThread({
    scenario: "MISSING_FISCAL_DOCS",
    status: "WAITING_EXTERNAL",
    priority: "CRITICAL",
    supportingDocUrls: ["/facturas?search=PROV-2026-017"],
    subject: `Docs. fiscales faltantes T4-2025 — ${exportadora?.name ?? "Exportadora Mediterránea"} (modelo 303)`,
    summary: "Factura de cierre T4-2025 necesaria para modelo 303. Primera solicitud enviada.",
    contactId: exportadora?.id,
    externalEmail: exportadora?.accountingEmail ?? exportadora?.email ?? "fiscal@exportadora.es",
    externalName: exportadora?.name ?? "Exportadora Mediterránea",
    followUpCount: 1,
    lastFollowUpAt: daysAgo(2),
    nextFollowUpAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
    dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    lastActivityAt: daysAgo(2),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Hilo creado: MISSING_FISCAL_DOCS. Documentación fiscal T4-2025 faltante. Plazo modelo 303: 5 días.",
        createdAt: daysAgo(3),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nNecesitamos la factura de cierre del cuarto trimestre 2025 para completar el modelo 303. El plazo de presentación vence en 5 días hábiles.\n\nLes rogamos nos la envíen con la mayor urgencia posible.\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: {
          to: "fiscal@exportadora.es",
          subject: "URGENTE: Documentación fiscal T4-2025 pendiente",
        },
        createdAt: daysAgo(2),
      },
    ],
  });

  // Thread 6: GESTORIA_RECONCILIATION — RESOLVED with conversation
  await createThread({
    scenario: "GESTORIA_RECONCILIATION",
    status: "RESOLVED",
    priority: "MEDIUM",
    subject: `Conciliación gestoría febrero 2026 — ${asesoria?.name ?? "Asesoría Fiscal"}`,
    summary:
      "Conciliación de febrero completada. Diferencia de 45,00 EUR identificada como comisión bancaria.",
    contactId: asesoria?.id,
    externalName: asesoria?.name ?? "Asesoría Fiscal",
    followUpCount: 0,
    resolvedAt: daysAgo(5),
    lastActivityAt: daysAgo(5),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Hilo creado: GESTORIA_RECONCILIATION. Diferencia de 45,00 EUR en conciliación de febrero.",
        createdAt: daysAgo(10),
      },
      {
        role: "CONTROLLER",
        channel: "APP",
        content:
          "La diferencia de 45€ es una comisión del banco que no habíamos clasificado. Clasifica como 626 y cierra.",
        createdAt: daysAgo(7),
      },
      {
        role: "AGENT",
        channel: "APP",
        content:
          "Entendido. He clasificado los 45,00 EUR como comisión bancaria (cuenta 626). ¿Confirmo el cierre del hilo?",
        createdAt: daysAgo(7),
      },
      { role: "CONTROLLER", channel: "APP", content: "Sí, cierra.", createdAt: daysAgo(5) },
      {
        role: "SYSTEM",
        channel: "APP",
        content: "Hilo resuelto manualmente por el controller.",
        createdAt: daysAgo(5),
      },
    ],
  });

  // Thread 7: BANK_RETURN — HIGH, WAITING_EXTERNAL, 2 follow-ups
  await createThread({
    scenario: "BANK_RETURN",
    status: "WAITING_EXTERNAL",
    priority: "HIGH",
    supportingDocUrls: ["/movimientos"],
    subject: `Devolución bancaria FRA-2026-019 — ${transportes?.name ?? "Transportes García"} (890,00 EUR)`,
    summary: "Devolución bancaria del cobro de factura FRA-2026-019. 2 follow-ups enviados.",
    contactId: transportes?.id,
    externalEmail: transportes?.accountingEmail ?? transportes?.email ?? "admin@transportes.es",
    externalName: transportes?.name ?? "Transportes García",
    followUpCount: 2,
    lastFollowUpAt: daysAgo(3),
    nextFollowUpAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
    lastActivityAt: daysAgo(3),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content: "Hilo creado: BANK_RETURN. Devolución de 890,00 EUR del cobro de FRA-2026-019.",
        createdAt: daysAgo(10),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nLe informamos que el cobro de 890,00 EUR correspondiente a la factura FRA-2026-019 ha sido devuelto por su banco.\n\nLes rogamos procedan a un nuevo pago por transferencia.\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: {
          to: "admin@transportes.es",
          subject: "Devolución bancaria — FRA-2026-019 (890,00 EUR)",
        },
        createdAt: daysAgo(8),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nEn relación con nuestro email anterior, la factura FRA-2026-019 (890,00 EUR) sigue pendiente tras la devolución bancaria.\n\n¿Podrían indicarnos cuándo realizarán el pago?\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: {
          to: "admin@transportes.es",
          subject: "Re: Devolución bancaria — FRA-2026-019",
        },
        createdAt: daysAgo(3),
      },
    ],
  });

  // Thread 8: UNIDENTIFIED_ADVANCE — WAITING_CONTROLLER
  await createThread({
    scenario: "UNIDENTIFIED_ADVANCE",
    status: "WAITING_CONTROLLER",
    priority: "MEDIUM",
    subject: `Anticipo no identificado — ${envases?.name ?? "Envases Plásticos"} (750,00 EUR)`,
    summary: "Cobro de 750,00 EUR sin factura asociada. No se pudo identificar el concepto.",
    blockedReason:
      "Cobro sin factura asociada. ¿Corresponde a un anticipo, un pago parcial, o un error?",
    contactId: envases?.id,
    externalEmail: envases?.accountingEmail ?? envases?.email ?? "admin@envases.es",
    externalName: envases?.name ?? "Envases Plásticos",
    followUpCount: 1,
    lastFollowUpAt: daysAgo(3),
    lastActivityAt: daysAgo(1),
    messages: [
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Hilo creado: UNIDENTIFIED_ADVANCE. Cobro de 750,00 EUR de Envases Plásticos sin factura asociada.",
        createdAt: daysAgo(5),
      },
      {
        role: "AGENT",
        channel: "EMAIL",
        content:
          "Estimado/a,\n\nHemos recibido una transferencia de 750,00 EUR a nuestro favor. No hemos podido vincularla a ninguna factura pendiente.\n\n¿Podrían indicarnos a qué corresponde este pago?\n\nUn cordial saludo,\nDepartamento de Administración",
        channelMeta: {
          to: "admin@envases.es",
          subject: "Consulta: transferencia de 750,00 EUR sin referencia",
        },
        createdAt: daysAgo(3),
      },
      {
        role: "EXTERNAL",
        channel: "EMAIL",
        content:
          "Hola,\n\nCreo que es un anticipo del pedido que hicimos la semana pasada, pero no estoy seguro. Voy a consultar con mi responsable y les confirmo.\n\nSaludos",
        createdAt: daysAgo(1),
      },
      {
        role: "SYSTEM",
        channel: "APP",
        content:
          "Respuesta procesada: El contacto no está seguro. Posible anticipo de pedido. Promete consultar.",
        createdAt: daysAgo(1),
      },
      {
        role: "SYSTEM",
        channel: "APP",
        content: "Escalado al controller: respuesta ambigua, requiere decisión.",
        suggestedActions: [
          { type: "wait_and_verify", label: "Esperar confirmación" },
          { type: "request_more_info", label: "Pedir referencia del pedido" },
          { type: "close", label: "Registrar como anticipo (438)" },
        ],
        createdAt: daysAgo(1),
      },
    ],
  });

  // Update existing threads that may lack supportingDocUrls
  const docsMap: Record<string, string[]> = {
    OVERDUE_RECEIVABLE: ["/facturas?search=FRA-2026-016"],
    SUPPLIER_DISCREPANCY: ["/facturas?search=PROV-2026-001"],
    MISSING_FISCAL_DOCS: ["/facturas?search=PROV-2026-017"],
    BANK_RETURN: ["/movimientos"],
  };
  for (const [scenario, urls] of Object.entries(docsMap)) {
    await p.agentThread
      .updateMany({
        where: { companyId: cid, scenario, supportingDocUrls: { isEmpty: true } },
        data: { supportingDocUrls: urls },
      })
      .catch(() => {});
  }

  // FollowUpConfig for the company
  await p.followUpConfig.create({
    data: {
      companyId: cid,
      scenarioDefaults: {},
      defaultIntervalDays: 4,
      defaultMaxAttempts: 3,
      defaultToneProgression: ["friendly", "firm", "formal"],
      autoResolveEnabled: true,
      staleDays: 7,
    },
  });

  console.log(`  ✅ 8 agent threads + 1 follow-up config`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
