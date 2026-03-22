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
  amount: number; valueDate: Date; concept: string; counterpartIban: string | null;
  counterpartName: string | null; status: string; balanceAfter: number;
  reference?: string; detectedType?: string; priority?: string;
}> = [];

function addTx(amount: number, date: Date, concept: string, iban: string | null, name: string | null, status = "PENDING") {
  balance = round(balance + amount);
  txs.push({ amount, valueDate: date, concept, counterpartIban: iban, counterpartName: name, status, balanceAfter: balance });
}

// ── Main ──
async function main() {
  // Step 0: Idempotency
  const existing = await prisma.company.findFirst({ where: { cif: COMPANY_CIF } });
  if (existing) {
    console.log("⚠️  Seed data already exists. Delete the company or run prisma migrate reset.");
    return;
  }

  // Step 1: Supabase Auth user
  try {
    await supabase.auth.admin.createUser({
      email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already")) console.warn("Auth user warning:", msg);
  }
  console.log(`✅ Supabase Auth: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // Step 2: Company
  const company = await prisma.company.create({
    data: {
      name: "Alimentación Mediterránea SL", cif: COMPANY_CIF, currency: "EUR",
      autoApproveThreshold: 0.90, materialityThreshold: 5000, materialityMinor: 5, preAlertDays: 7,
    },
  });
  const cid = company.id;

  // Step 3: User
  const user = await prisma.user.create({
    data: { email: DEMO_EMAIL, name: "Admin Demo", role: "ADMIN", status: "ACTIVE", companyId: cid },
  });
  const userId = user.id;

  // Step 4: Own bank accounts
  await prisma.ownBankAccount.createMany({
    data: [
      { iban: OWN_IBAN_1, bankName: "CaixaBank", alias: "Cuenta principal", companyId: cid },
      { iban: OWN_IBAN_2, bankName: "BBVA", alias: "Cuenta operativa", companyId: cid },
    ],
  });

  // Step 5: PGC Accounts
  for (const acc of PGC_SEED_ACCOUNTS) {
    await prisma.account.create({
      data: {
        code: acc.code, name: acc.name, group: acc.group,
        parentCode: acc.code.length > 1 ? acc.code.slice(0, -1) : null,
        pygLine: acc.pygLine ?? null, companyId: cid,
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
  const inv = async (...args: Parameters<typeof mkInvoice>) => { const i = await mkInvoice(...args); invoices.push(i); return i; };

  // Distribuidora Levante — 8 issued
  const lev1 = await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,1,5), 7843.21, "PAID", 45);
  const lev2 = await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,1,12), 12567.89, "PAID", 45);
  const lev3 = await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,1,20), 4521.00, "PAID", 45);
  await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,2,3), 9876.54, "PAID", 45);
  await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,2,15), 3210.00, "PAID", 45);
  const levPend1 = await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,2,22), 8500.00, "PENDING", 45);
  const levPend2 = await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,3,5), 6750.00, "PENDING", 45);
  await inv(cid, c.B11111111.id, fraNum(), "ISSUED", d(2026,1,8), 5400.00, "OVERDUE", 45);

  // Supermercados Costa — 7 issued
  const costaPartial = await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026,1,10), 18500.00, "PARTIAL", 60, 11100);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026,1,18), 12340.50, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026,2,2), 8760.00, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026,2,14), 22100.00, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026,2,25), 5430.00, "PAID", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026,3,4), 15800.00, "PENDING", 60);
  await inv(cid, c.B22222222.id, fraNum(), "ISSUED", d(2026,3,12), 9200.00, "PENDING", 60);

  // Hostelería del Sur — 6 issued, all PAID
  for (const [day, amt] of [[3,2150],[15,3420],[25,1890],[8,4100],[18,2750],[28,1560]] as const) {
    const m = day <= 25 && invoiceCounter < 20 ? 1 : day <= 25 ? 2 : 3;
    await inv(cid, c.A33333333.id, fraNum(), "ISSUED", d(2026, m, day), amt, "PAID", 30);
  }

  // Mercados Regionales — 5 issued
  const mercOverdue = await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2025,11,15), 6200.00, "OVERDUE", 90);
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026,1,10), 4500.00, "PAID", 90);
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026,1,22), 7800.00, "PAID", 90);
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026,2,8), 3200.00, "PENDING", 90);
  await inv(cid, c.B44444444.id, fraNum(), "ISSUED", d(2026,3,1), 5600.00, "PENDING", 90);

  // Exportadora Ibérica — 4 issued (large amounts for materiality)
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026,1,5), 35000.00, "PAID", 30);
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026,2,10), 48500.00, "PAID", 30);
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026,2,28), 22000.00, "PENDING", 30);
  await inv(cid, c.B55555555.id, fraNum(), "ISSUED", d(2026,3,15), 41000.00, "PENDING", 30);

  // Catering Barcelona — 5 issued, all PENDING (for grouped match)
  const cat1 = await inv(cid, c.B66666666.id, fraNum(), "ISSUED", d(2026,2,5), 1250.00, "PENDING", 45);
  const cat2 = await inv(cid, c.B66666666.id, fraNum(), "ISSUED", d(2026,2,12), 890.00, "PENDING", 45);
  const cat3 = await inv(cid, c.B66666666.id, fraNum(), "ISSUED", d(2026,2,20), 2100.00, "PENDING", 45);
  await inv(cid, c.B66666666.id, fraNum(), "ISSUED", d(2026,3,3), 750.00, "PENDING", 45);
  await inv(cid, c.B66666666.id, fraNum(), "ISSUED", d(2026,3,10), 560.00, "PENDING", 45);

  // Grupo Alimentario — 3 ISSUED
  await inv(cid, c.B15151515.id, fraNum(), "ISSUED", d(2026,1,15), 8400.00, "PAID", 45);
  await inv(cid, c.B15151515.id, fraNum(), "ISSUED", d(2026,2,10), 11200.00, "PAID", 45);
  await inv(cid, c.B15151515.id, fraNum(), "ISSUED", d(2026,3,5), 6800.00, "PENDING", 45);

  // --- RECEIVED invoices ---
  // Materias Primas — 6
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026,1,8), 14520.30, "PAID", 30);
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026,1,20), 8934.50, "PAID", 30);
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026,2,5), 17650.00, "PAID", 30);
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026,2,18), 6230.00, "PAID", 30);
  const matPend1 = await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026,3,2), 11890.00, "PENDING", 30);
  await inv(cid, c.B77777777.id, provNum(), "RECEIVED", d(2026,3,12), 9450.00, "PENDING", 30);

  // Envases — 5
  const env1 = await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026,1,10), 2340.50, "PAID", 45);
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026,1,25), 3150.00, "PAID", 45);
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026,2,8), 1870.00, "PAID", 45);
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026,2,22), 2890.00, "PENDING", 45);
  await inv(cid, c.A88888888.id, provNum(), "RECEIVED", d(2026,3,5), 1560.00, "PENDING", 45);

  // Transportes — 5 all PAID
  for (const [day, amt] of [[5,890],[15,1230],[25,670],[10,1540],[20,980]] as const) {
    const m = provCounter < 16 ? 1 : provCounter < 19 ? 2 : 3;
    await inv(cid, c.B99999999.id, provNum(), "RECEIVED", d(2026, m, day), amt, "PAID", 30);
  }

  // Asesoría — 3 all PAID
  await inv(cid, c.B10101010.id, provNum(), "RECEIVED", d(2026,1,15), 1210.00, "PAID", 15);
  await inv(cid, c.B10101010.id, provNum(), "RECEIVED", d(2026,2,15), 1089.00, "PAID", 15);
  await inv(cid, c.B10101010.id, provNum(), "RECEIVED", d(2026,3,15), 1331.00, "PAID", 15);

  // Inmobiliaria (alquiler) — 3 exact 3025€
  await inv(cid, c.B12121212.id, provNum(), "RECEIVED", d(2026,1,1), 3025.00, "PAID", 0);
  await inv(cid, c.B12121212.id, provNum(), "RECEIVED", d(2026,2,1), 3025.00, "PAID", 0);
  await inv(cid, c.B12121212.id, provNum(), "RECEIVED", d(2026,3,1), 3025.00, "PAID", 0);

  // Vodafone — 3
  await inv(cid, c.A13131313.id, provNum(), "RECEIVED", d(2026,1,5), 302.50, "PAID", 0);
  await inv(cid, c.A13131313.id, provNum(), "RECEIVED", d(2026,2,5), 302.50, "PAID", 0);
  await inv(cid, c.A13131313.id, provNum(), "RECEIVED", d(2026,3,5), 302.50, "PAID", 0);

  // Endesa — 3
  await inv(cid, c.A14141414.id, provNum(), "RECEIVED", d(2026,1,10), 423.50, "PAID", 0);
  await inv(cid, c.A14141414.id, provNum(), "RECEIVED", d(2026,2,10), 387.20, "PAID", 0);
  await inv(cid, c.A14141414.id, provNum(), "RECEIVED", d(2026,3,10), 456.30, "PENDING", 0);

  // Grupo Alimentario — 2 RECEIVED
  await inv(cid, c.B15151515.id, provNum(), "RECEIVED", d(2026,1,20), 4500.00, "PAID", 45);
  await inv(cid, c.B15151515.id, provNum(), "RECEIVED", d(2026,3,8), 5800.00, "PENDING", 45);

  // Credit notes
  const cn1 = await inv(cid, c.B11111111.id, ncNum(), "CREDIT_ISSUED", d(2026,2,28), 500.00, "PENDING", 0);
  await prisma.invoice.update({ where: { id: cn1.id }, data: { creditNoteForId: lev1.id } });
  const cn2 = await inv(cid, c.B44444444.id, ncNum(), "CREDIT_ISSUED", d(2026,3,10), 1200.00, "PENDING", 0);
  await prisma.invoice.update({ where: { id: cn2.id }, data: { creditNoteForId: mercOverdue.id } });
  const cn3 = await inv(cid, c.B77777777.id, ncNum(), "CREDIT_RECEIVED", d(2026,3,5), 800.00, "PENDING", 0);
  await prisma.invoice.update({ where: { id: cn3.id }, data: { creditNoteForId: matPend1.id } });
  const cn4 = await inv(cid, c.A88888888.id, ncNum(), "CREDIT_RECEIVED", d(2026,3,8), 350.00, "PENDING", 0);
  await prisma.invoice.update({ where: { id: cn4.id }, data: { creditNoteForId: env1.id } });

  // Step 8: Bank transactions
  // Scenario 1 — exact cobros for PAID invoices
  // Jan/Feb → RECONCILED (already processed), Mar → PENDING (for engine)
  for (const i of invoices.filter(i => i.type === "ISSUED" && i.status === "PAID")) {
    const ct = contacts.find(ct => ct.id === i.contactId)!;
    const txDate = new Date(i.issueDate.getTime() + (5 + Math.floor(Math.random()*10)) * 86400000);
    const txStatus = txDate.getMonth() < 2 ? "RECONCILED" : "PENDING"; // 0=Jan, 1=Feb
    addTx(i.totalAmount, txDate, `TRANSFERENCIA A FAVOR ${ct.name} REF ${i.number}`, ct.iban, ct.name, txStatus);
  }

  // Scenario 2 — partial cobro
  addTx(costaPartial.amountPaid, new Date(costaPartial.issueDate.getTime() + 15 * 86400000),
    `PAGO PARCIAL FRA ${costaPartial.number}`, IBANS.costa, "Supermercados Costa SL");

  // Scenario 3 — grouped cobro (3 Catering invoices)
  const groupedAmount = cat1.totalAmount + cat2.totalAmount + cat3.totalAmount;
  addTx(groupedAmount, d(2026, 3, 1), "TRANSFERENCIA AGRUPADA CATERING BARCELONA", IBANS.catering, "Catering Barcelona SL");

  // Scenario 4 — cobros with differences
  addTx(round(levPend1.totalAmount * 0.98), d(2026, 3, 12), "TRANSF DISTRIB LEVANTE DCTO PP", IBANS.levante, "Distribuidora Levante SL");
  addTx(round(levPend2.totalAmount * 0.98), d(2026, 3, 18), "TRANSF DISTRIB LEVANTE MENOS DCTO", IBANS.levante, "Distribuidora Levante SL");
  addTx(round(levPend1.totalAmount - 15), d(2026, 3, 14), "TRANSF LEVANTE COMISION BANCARIA", IBANS.levante, "Distribuidora Levante SL");

  // Scenarios 5-6 — pagos for PAID received invoices
  // Jan/Feb → RECONCILED, Mar → PENDING
  for (const i of invoices.filter(i => i.type === "RECEIVED" && i.status === "PAID")) {
    const ct = contacts.find(ct => ct.id === i.contactId)!;
    const txDate = new Date(i.issueDate.getTime() + (3 + Math.floor(Math.random()*7)) * 86400000);
    const txStatus = txDate.getMonth() < 2 ? "RECONCILED" : "PENDING";
    addTx(-i.totalAmount, txDate, `PAGO TRANSFERENCIA A ${ct.name} FRA ${i.number}`, ct.iban, ct.name, txStatus);
  }

  // Scenario 7 — recurring expenses without invoice
  for (const m of [1, 2, 3]) {
    addTx(-25.00, d(2026, m, 3), `COMISION MANTENIMIENTO CTA EUR ${String(m).padStart(2,"0")}/2026`, null, null);
    addTx(-(290 + Math.random() * 20), d(2026, m, 8), "RECIBO DOMICILIADO VODAFONE ESPAÑA", IBANS.vodafone, "Vodafone España SAU");
    addTx(-(350 + Math.random() * 130), d(2026, m, 12), "RECIBO DOMICILIADO ENDESA ENERGIA", IBANS.endesa, "Endesa Energía SA");
  }
  addTx(-25.00, d(2026, 1, 15), "COMISION MANTENIMIENTO CTA EUR EXTRA", null, null);
  addTx(-450.00, d(2026, 1, 20), "SEGURO RC EMPRESA MAPFRE", null, null);
  addTx(-450.00, d(2026, 3, 20), "SEGURO RC EMPRESA MAPFRE", null, null);

  // Scenario 8 — unidentified income
  addTx(2500.00, d(2026, 2, 15), "INGRESO EN EFECTIVO OFICINA 0234", null, null);
  addTx(750.00, d(2026, 2, 20), "TRANSFERENCIA RECIBIDA", "ES9876543210987654321098", "EMPRESA NUEVA SL");
  addTx(18500.00, d(2026, 3, 8), "TRANSFERENCIA RECIBIDA REF 999", "ES5678901234567890123456", null);

  // Scenario 9 — return of cobro (pick 2 early cobros)
  const cobro1 = txs.find(t => t.amount > 0 && t.counterpartIban === IBANS.hosteleria)!;
  addTx(-cobro1.amount, new Date(cobro1.valueDate.getTime() + 12 * 86400000),
    `DEVOLUCION RECIBO ${cobro1.concept.slice(-10)} IMPAGADO`, cobro1.counterpartIban, cobro1.counterpartName);
  const cobro2 = txs.find(t => t.amount > 0 && t.counterpartIban === IBANS.mercados)!;
  addTx(-cobro2.amount, new Date(cobro2.valueDate.getTime() + 15 * 86400000),
    `DEVOLUCION RECIBO IMPAGADO`, cobro2.counterpartIban, cobro2.counterpartName);

  // Scenario 10 — return of pago
  const pago1 = txs.find(t => t.amount < 0 && t.counterpartIban === IBANS.envases)!;
  addTx(-pago1.amount, new Date(pago1.valueDate.getTime() + 10 * 86400000),
    "DEVOLUCION TRANSFERENCIA ENVASES", pago1.counterpartIban, pago1.counterpartName);

  // Scenario 11 — internal transfers (3 pairs)
  for (const [amt, day] of [[10000, 5], [5000, 15], [25000, 25]] as const) {
    addTx(-amt, d(2026, 2, day), "TRASPASO ENTRE CUENTAS", OWN_IBAN_2, "BBVA Cuenta operativa");
    addTx(amt, d(2026, 2, day), "TRASPASO ENTRE CUENTAS", OWN_IBAN_1, "CaixaBank Cuenta principal");
  }

  // Scenario 12 — possible duplicates (2 pairs)
  addTx(-3500.00, d(2026, 2, 10), "PAGO ENVASES PACKAGING FRA PROV-2026-008", IBANS.envases, "Envases y Packaging SA");
  addTx(-3500.00, d(2026, 2, 11), "PAGO ENVASES PACKAGING FRA PROV-2026-008", IBANS.envases, "Envases y Packaging SA");
  addTx(8000.00, d(2026, 3, 5), "COBRO HOSTELERIA DEL SUR REF MAR", IBANS.hosteleria, "Hostelería del Sur SA");
  addTx(8000.00, d(2026, 3, 5), "COBRO HOSTELERIA SUR MARZO", IBANS.hosteleria, "Hostelería del Sur SA");

  // Scenario 17 — credit note transactions
  addTx(-cn1.totalAmount, d(2026, 3, 2), `ABONO ${cn1.number}`, IBANS.levante, "Distribuidora Levante SL");
  addTx(-cn2.totalAmount, d(2026, 3, 12), `ABONO ${cn2.number}`, IBANS.mercados, "Mercados Regionales SL");
  addTx(cn3.totalAmount, d(2026, 3, 8), `ABONO ${cn3.number}`, IBANS.materias, "Materias Primas del Campo SL");
  addTx(cn4.totalAmount, d(2026, 3, 10), `ABONO ${cn4.number}`, IBANS.envases, "Envases y Packaging SA");

  // Scenario 18 — no match
  addTx(-7777.77, d(2026, 2, 18), "PAGO PENDIENTE CONCEPTO GENERICO", IBANS.materias, "Materias Primas del Campo SL");
  addTx(3333.33, d(2026, 3, 3), "COBRO SIN REFERENCIA CLARA", IBANS.levante, "Distribuidora Levante SL");
  addTx(-12345.67, d(2026, 3, 14), "PAGO PENDIENTE REF DESCONOCIDA", "ES0000000000000000000000", null);
  addTx(999.99, d(2026, 3, 16), "TRANSFERENCIA RECIBIDA", null, null);

  // Nóminas + préstamo + SS
  for (const m of [1, 2, 3]) {
    addTx(-(15200 + Math.random() * 200), d(2026, m, 28), `NOMINA EMPLEADOS ${["ENE","FEB","MAR"][m-1]} 2026`, IBANS.tgss, "TGSS TESORERIA GENERAL");
    addTx(-2850.00, d(2026, m, 5), "CUOTA PRESTAMO ICO REF 123456", IBANS.caixaPrestamoIban, "CAIXABANK PRESTAMOS");
    addTx(-(5100 + Math.random() * 100), d(2026, m, 29), `SS EMPRESA ${["ENE","FEB","MAR"][m-1]} 2026`, IBANS.tgss, "TGSS TESORERIA GENERAL");
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
        valueDate: t.valueDate, bookingDate: t.valueDate,
        amount: round(t.amount), currency: "EUR",
        concept: t.concept, counterpartIban: t.counterpartIban, counterpartName: t.counterpartName,
        balanceAfter: t.balanceAfter, status: t.status as "PENDING",
        priority: "ROUTINE", companyId: cid,
      },
    });
  }

  // Step 9: Matching Rules
  await prisma.matchingRule.createMany({
    data: [
      { name: "Comisiones bancarias", type: "CONCEPT_CLASSIFY", origin: "MANUAL", status: "ACTIVE", priority: 5, isActive: true, timesApplied: 12, pattern: "COMISION MANTENIMIENTO", action: "classify", accountCode: "626", cashflowType: "OPERATING", companyId: cid },
      { name: "Vodafone telecomunicaciones", type: "IBAN_CLASSIFY", origin: "INLINE", status: "ACTIVE", priority: 3, isActive: true, timesApplied: 8, counterpartIban: IBANS.vodafone, action: "classify", accountCode: "628", cashflowType: "OPERATING", companyId: cid },
      { name: "Alquiler nave", type: "EXACT_AMOUNT_CONTACT", origin: "MANUAL", status: "ACTIVE", priority: 5, isActive: true, timesApplied: 6, counterpartIban: IBANS.inmobiliaria, minAmount: 2800, maxAmount: 3200, action: "classify", accountCode: "621", cashflowType: "OPERATING", companyId: cid },
      { name: "Seguro RC Mapfre", type: "CONCEPT_CLASSIFY", origin: "MANUAL", status: "PAUSED", priority: 2, isActive: false, timesApplied: 3, pattern: "SEGURO.*MAPFRE", action: "classify", accountCode: "625", cashflowType: "OPERATING", companyId: cid },
    ],
  });

  // Step 10: Controller Decisions (25)
  const decisionData = [];
  for (let i = 0; i < 15; i++) {
    decisionData.push(mkDecision(cid, userId, "approve", false, contacts[i % contacts.length], d(2026, 1 + Math.floor(i/8), 5 + i)));
  }
  for (let i = 0; i < 5; i++) {
    decisionData.push(mkDecision(cid, userId, "approve", true, contacts[i], d(2026, 2, 10 + i)));
  }
  for (let i = 0; i < 3; i++) {
    decisionData.push(mkDecision(cid, userId, "classify", true, contacts[7 + i], d(2026, 2, 15 + i)));
  }
  decisionData.push(mkDecision(cid, userId, "reject", true, contacts[3], d(2026, 2, 20)));
  decisionData.push(mkDecision(cid, userId, "reject", true, contacts[4], d(2026, 2, 22)));

  await prisma.controllerDecision.createMany({ data: decisionData });

  // Step 11: Learned Patterns
  await prisma.learnedPattern.createMany({
    data: [
      { type: "differenceReason", status: "SUGGESTED", isActive: true, counterpartIban: IBANS.levante, counterpartName: "Distribuidora Levante SL", predictedAction: "EARLY_PAYMENT", predictedReason: "EARLY_PAYMENT", confidence: 0.85, occurrences: 4, correctPredictions: 3, companyId: cid },
      { type: "classification", status: "ACTIVE_SUPERVISED", isActive: true, counterpartIban: IBANS.tgss, counterpartName: "TGSS TESORERIA GENERAL", predictedAction: "classify:640", predictedAccount: "640", confidence: 0.92, occurrences: 8, correctPredictions: 7, supervisedApplyCount: 5, reviewedAt: d(2026, 3, 1), companyId: cid },
      { type: "differenceReason", status: "PROMOTED", isActive: false, counterpartIban: IBANS.costa, counterpartName: "Supermercados Costa SL", predictedAction: "BANK_COMMISSION", predictedReason: "BANK_COMMISSION", confidence: 0.90, occurrences: 6, correctPredictions: 6, companyId: cid },
      { type: "classification", status: "REJECTED", isActive: false, counterpartIban: "ES0000000000000000000000", predictedAction: "classify:629", predictedAccount: "629", confidence: 0.55, occurrences: 2, correctPredictions: 1, reviewedAt: d(2026, 3, 5), companyId: cid },
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
  const issuedCount = invoices.filter(i => i.type === "ISSUED").length;
  const receivedCount = invoices.filter(i => i.type === "RECEIVED").length;
  const creditCount = invoices.filter(i => i.type.startsWith("CREDIT")).length;

  console.log("\n🌱 Seed completado:");
  console.log(`   🏢 Empresa: Alimentación Mediterránea SL`);
  console.log(`   👤 Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   👥 Contactos: ${contacts.length}`);
  console.log(`   🧾 Facturas: ${invoices.length} (${issuedCount} emitidas, ${receivedCount} recibidas, ${creditCount} notas de crédito)`);
  console.log(`   🏦 Movimientos bancarios: ${txs.length}`);
  console.log(`   📏 Reglas: 4`);
  console.log(`   🧠 Patrones aprendidos: 4`);
  console.log(`   📊 Decisiones históricas: ${decisionData.length}`);
  console.log(`\n   Para ejecutar el engine de conciliación:`);
  console.log(`   POST /api/reconciliation/run\n`);
}

// ── Helper functions ──

async function mkContact(companyId: string, name: string, cif: string, iban: string, type: string, avgPaymentDays: number) {
  return prisma.contact.create({
    data: { name, cif, iban, type: type as "CUSTOMER", avgPaymentDays, companyId },
  });
}

async function mkInvoice(
  companyId: string, contactId: string, number: string, type: string,
  issueDate: Date, totalAmount: number, status: string, avgDays: number, amountPaid = 0
) {
  const dueDate = new Date(issueDate.getTime() + avgDays * 86400000);
  const isPaid = status === "PAID";
  const paid = isPaid ? totalAmount : amountPaid;
  const pending = isPaid ? 0 : round(totalAmount - paid);

  const invoice = await prisma.invoice.create({
    data: {
      number, type: type as "ISSUED", issueDate, dueDate: avgDays > 0 ? dueDate : null,
      totalAmount, netAmount: net(totalAmount), vatAmount: vat(totalAmount),
      currency: "EUR", status: status as "PENDING",
      amountPaid: paid, amountPending: pending, companyId, contactId,
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
  companyId: string, uid: string, action: string, wasModified: boolean,
  contact: { name: string; cif: string | null; iban: string | null },
  date: Date
) {
  const absAmount = 1000 + Math.random() * 20000;
  const amountRange = absAmount < 100 ? "0-100"
    : absAmount < 500 ? "100-500"
    : absAmount < 5000 ? "500-5000"
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

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
