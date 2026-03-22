/**
 * PGC (Plan General Contable) seed script.
 *
 * Creates standard Spanish chart of accounts for a given company.
 * Idempotent — skips accounts that already exist.
 *
 * Usage: npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Standard PGC accounts for PYMEs
const PGC_ACCOUNTS: { code: string; name: string; group: number; pygLine?: string }[] = [
  // Grupo 1 — Financiación básica
  { code: "100", name: "Capital social", group: 1 },
  { code: "110", name: "Prima de emisión", group: 1 },
  { code: "112", name: "Reserva legal", group: 1 },
  { code: "113", name: "Reservas voluntarias", group: 1 },
  { code: "120", name: "Remanente", group: 1 },
  { code: "121", name: "Resultados negativos de ejercicios anteriores", group: 1 },
  { code: "129", name: "Resultado del ejercicio", group: 1 },
  { code: "170", name: "Deudas a l/p con entidades de crédito", group: 1 },
  { code: "171", name: "Deudas a l/p", group: 1 },
  { code: "174", name: "Acreedores por arrendamiento financiero a l/p", group: 1 },

  // Grupo 2 — Activo no corriente
  { code: "200", name: "Investigación", group: 2 },
  { code: "206", name: "Aplicaciones informáticas", group: 2 },
  { code: "210", name: "Terrenos y bienes naturales", group: 2 },
  { code: "211", name: "Construcciones", group: 2 },
  { code: "212", name: "Instalaciones técnicas", group: 2 },
  { code: "213", name: "Maquinaria", group: 2 },
  { code: "214", name: "Utillaje", group: 2 },
  { code: "215", name: "Otras instalaciones", group: 2 },
  { code: "216", name: "Mobiliario", group: 2 },
  { code: "217", name: "Equipos para procesos de información", group: 2 },
  { code: "218", name: "Elementos de transporte", group: 2 },
  { code: "219", name: "Otro inmovilizado material", group: 2 },
  { code: "220", name: "Inversiones en terrenos", group: 2 },
  { code: "221", name: "Inversiones en construcciones", group: 2 },
  { code: "250", name: "Inversiones financieras a l/p en instrumentos de patrimonio", group: 2 },
  { code: "252", name: "Créditos a l/p", group: 2 },
  { code: "280", name: "Amortización acumulada del inmovilizado intangible", group: 2 },
  { code: "281", name: "Amortización acumulada del inmovilizado material", group: 2 },
  { code: "282", name: "Amortización acumulada de inversiones inmobiliarias", group: 2 },

  // Grupo 3 — Existencias
  { code: "300", name: "Mercaderías", group: 3 },
  { code: "310", name: "Materias primas", group: 3 },
  { code: "350", name: "Productos terminados", group: 3 },

  // Grupo 4 — Acreedores y deudores
  { code: "400", name: "Proveedores", group: 4 },
  { code: "401", name: "Proveedores, efectos comerciales a pagar", group: 4 },
  { code: "410", name: "Acreedores por prestaciones de servicios", group: 4 },
  { code: "430", name: "Clientes", group: 4 },
  { code: "431", name: "Clientes, efectos comerciales a cobrar", group: 4 },
  { code: "435", name: "Clientes de dudoso cobro", group: 4 },
  { code: "440", name: "Deudores", group: 4 },
  { code: "460", name: "Anticipos de remuneraciones", group: 4 },
  { code: "465", name: "Remuneraciones pendientes de pago", group: 4 },
  { code: "470", name: "Hacienda Pública, deudora por diversos conceptos", group: 4 },
  { code: "471", name: "Organismos de la SS, deudores", group: 4 },
  { code: "472", name: "Hacienda Pública, IVA soportado", group: 4 },
  { code: "473", name: "Hacienda Pública, retenciones y pagos a cuenta", group: 4 },
  { code: "474", name: "Activos por impuesto diferido", group: 4 },
  { code: "475", name: "Hacienda Pública, acreedora por conceptos fiscales", group: 4 },
  { code: "476", name: "Organismos de la SS, acreedores", group: 4 },
  { code: "477", name: "Hacienda Pública, IVA repercutido", group: 4 },
  { code: "480", name: "Gastos anticipados", group: 4 },
  { code: "485", name: "Ingresos anticipados", group: 4 },

  // Grupo 5 — Cuentas financieras
  { code: "520", name: "Deudas a c/p con entidades de crédito", group: 5 },
  { code: "524", name: "Acreedores por arrendamiento financiero a c/p", group: 5 },
  { code: "526", name: "Dividendo activo a pagar", group: 5 },
  { code: "551", name: "Cuenta corriente con socios y administradores", group: 5 },
  { code: "555", name: "Partidas pendientes de aplicación", group: 5 },
  { code: "570", name: "Caja, euros", group: 5 },
  { code: "572", name: "Bancos e instituciones de crédito c/c vista, euros", group: 5 },
  { code: "574", name: "Bancos e instituciones de crédito, cuentas de ahorro, euros", group: 5 },

  // Grupo 6 — Compras y gastos
  { code: "600", name: "Compras de mercaderías", group: 6, pygLine: "4" },
  { code: "601", name: "Compras de materias primas", group: 6, pygLine: "4" },
  { code: "602", name: "Compras de otros aprovisionamientos", group: 6, pygLine: "4" },
  { code: "607", name: "Trabajos realizados por otras empresas", group: 6, pygLine: "4" },
  { code: "620", name: "Gastos en investigación y desarrollo del ejercicio", group: 6, pygLine: "7" },
  { code: "621", name: "Arrendamientos y cánones", group: 6, pygLine: "7" },
  { code: "622", name: "Reparaciones y conservación", group: 6, pygLine: "7" },
  { code: "623", name: "Servicios de profesionales independientes", group: 6, pygLine: "7" },
  { code: "624", name: "Transportes", group: 6, pygLine: "7" },
  { code: "625", name: "Primas de seguros", group: 6, pygLine: "7" },
  { code: "626", name: "Servicios bancarios y similares", group: 6, pygLine: "7" },
  { code: "627", name: "Publicidad, propaganda y relaciones públicas", group: 6, pygLine: "7" },
  { code: "628", name: "Suministros", group: 6, pygLine: "7" },
  { code: "629", name: "Otros servicios", group: 6, pygLine: "7" },
  { code: "631", name: "Otros tributos", group: 6, pygLine: "7" },
  { code: "634", name: "Ajustes negativos en la imposición indirecta", group: 6, pygLine: "7" },
  { code: "640", name: "Sueldos y salarios", group: 6, pygLine: "6" },
  { code: "641", name: "Indemnizaciones", group: 6, pygLine: "6" },
  { code: "642", name: "Seguridad Social a cargo de la empresa", group: 6, pygLine: "6" },
  { code: "649", name: "Otros gastos sociales", group: 6, pygLine: "6" },
  { code: "650", name: "Pérdidas de créditos comerciales incobrables", group: 6, pygLine: "7" },
  { code: "651", name: "Resultados de operaciones en común", group: 6, pygLine: "7" },
  { code: "659", name: "Otras pérdidas en gestión corriente", group: 6, pygLine: "7" },
  { code: "661", name: "Intereses de obligaciones y bonos", group: 6, pygLine: "13" },
  { code: "662", name: "Intereses de deudas", group: 6, pygLine: "13" },
  { code: "663", name: "Pérdidas por valoración de instrumentos financieros", group: 6, pygLine: "14" },
  { code: "664", name: "Gastos por dividendos de acciones consideradas como pasivos financieros", group: 6, pygLine: "13" },
  { code: "665", name: "Intereses por descuento de efectos y operaciones de factoring", group: 6, pygLine: "13" },
  { code: "666", name: "Pérdidas en participaciones y valores representativos de deuda", group: 6, pygLine: "16" },
  { code: "667", name: "Pérdidas de créditos no comerciales", group: 6, pygLine: "16" },
  { code: "668", name: "Diferencias negativas de cambio", group: 6, pygLine: "15" },
  { code: "669", name: "Otros gastos financieros", group: 6, pygLine: "13" },
  { code: "680", name: "Amortización del inmovilizado intangible", group: 6, pygLine: "8" },
  { code: "681", name: "Amortización del inmovilizado material", group: 6, pygLine: "8" },
  { code: "682", name: "Amortización de las inversiones inmobiliarias", group: 6, pygLine: "8" },
  { code: "690", name: "Pérdidas por deterioro del inmovilizado intangible", group: 6, pygLine: "11" },
  { code: "691", name: "Pérdidas por deterioro del inmovilizado material", group: 6, pygLine: "11" },
  { code: "694", name: "Pérdidas por deterioro de créditos por operaciones comerciales", group: 6, pygLine: "7" },
  { code: "6300", name: "Impuesto corriente", group: 6, pygLine: "17" },
  { code: "6301", name: "Impuesto diferido", group: 6, pygLine: "17" },

  // Grupo 7 — Ventas e ingresos
  { code: "700", name: "Ventas de mercaderías", group: 7, pygLine: "1" },
  { code: "701", name: "Ventas de productos terminados", group: 7, pygLine: "1" },
  { code: "705", name: "Prestaciones de servicios", group: 7, pygLine: "1" },
  { code: "706", name: "Descuentos sobre ventas por pronto pago", group: 7, pygLine: "1" },
  { code: "708", name: "Devoluciones de ventas", group: 7, pygLine: "1" },
  { code: "709", name: "Rappels sobre ventas", group: 7, pygLine: "1" },
  { code: "740", name: "Subvenciones, donaciones y legados a la explotación", group: 7, pygLine: "5" },
  { code: "746", name: "Subvenciones, donaciones y legados de capital transferidos al resultado del ejercicio", group: 7, pygLine: "9" },
  { code: "747", name: "Otras subvenciones, donaciones y legados transferidos al resultado del ejercicio", group: 7, pygLine: "5" },
  { code: "750", name: "Ingresos por servicios al personal", group: 7, pygLine: "5" },
  { code: "751", name: "Resultados de operaciones en común", group: 7, pygLine: "5" },
  { code: "752", name: "Ingresos por arrendamientos", group: 7, pygLine: "5" },
  { code: "759", name: "Ingresos por servicios diversos", group: 7, pygLine: "5" },
  { code: "760", name: "Ingresos de participaciones en instrumentos de patrimonio", group: 7, pygLine: "12" },
  { code: "761", name: "Ingresos de valores representativos de deuda", group: 7, pygLine: "12" },
  { code: "762", name: "Ingresos de créditos", group: 7, pygLine: "12" },
  { code: "763", name: "Beneficios por valoración de instrumentos financieros", group: 7, pygLine: "14" },
  { code: "766", name: "Beneficios en participaciones y valores representativos de deuda", group: 7, pygLine: "16" },
  { code: "768", name: "Diferencias positivas de cambio", group: 7, pygLine: "15" },
  { code: "769", name: "Otros ingresos financieros", group: 7, pygLine: "12" },
  { code: "770", name: "Beneficios procedentes del inmovilizado intangible", group: 7, pygLine: "11" },
  { code: "771", name: "Beneficios procedentes del inmovilizado material", group: 7, pygLine: "11" },
  { code: "790", name: "Reversión del deterioro del inmovilizado intangible", group: 7, pygLine: "11" },
  { code: "791", name: "Reversión del deterioro del inmovilizado material", group: 7, pygLine: "11" },
  { code: "794", name: "Reversión del deterioro de créditos por operaciones comerciales", group: 7, pygLine: "7" },
];

async function main() {
  // Find the first company, or exit
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("No company found. Create one first.");
    return;
  }

  console.log(`Seeding PGC accounts for company: ${company.name} (${company.id})`);

  let created = 0;
  let skipped = 0;

  for (const acct of PGC_ACCOUNTS) {
    const existing = await prisma.account.findFirst({
      where: { code: acct.code, companyId: company.id },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.account.create({
      data: {
        code: acct.code,
        name: acct.name,
        group: acct.group,
        parentCode: acct.code.length > 1 ? acct.code.slice(0, -1) : null,
        pygLine: acct.pygLine ?? null,
        companyId: company.id,
      },
    });
    created++;
  }

  console.log(`Done. Created: ${created}, Skipped (existing): ${skipped}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
