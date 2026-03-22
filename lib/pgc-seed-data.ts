/**
 * PGC (Plan General Contable) seed data.
 * Single source of truth — used by both prisma/seed.ts and onboarding API.
 */

export interface PgcSeedAccount {
  code: string;
  name: string;
  group: number;
  pygLine?: string;
}

export const PGC_SEED_ACCOUNTS: PgcSeedAccount[] = [
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
  { code: "250", name: "Inversiones financieras a l/p en instrumentos de patrimonio", group: 2 },
  { code: "281", name: "Amortización acumulada del inmovilizado material", group: 2 },
  // Grupo 3 — Existencias
  { code: "300", name: "Mercaderías", group: 3 },
  { code: "310", name: "Materias primas", group: 3 },
  { code: "350", name: "Productos terminados", group: 3 },
  // Grupo 4 — Acreedores y deudores
  { code: "400", name: "Proveedores", group: 4 },
  { code: "410", name: "Acreedores por prestaciones de servicios", group: 4 },
  { code: "430", name: "Clientes", group: 4 },
  { code: "440", name: "Deudores", group: 4 },
  { code: "460", name: "Anticipos de remuneraciones", group: 4 },
  { code: "465", name: "Remuneraciones pendientes de pago", group: 4 },
  { code: "470", name: "Hacienda Pública, deudora", group: 4 },
  { code: "472", name: "Hacienda Pública, IVA soportado", group: 4 },
  { code: "473", name: "Hacienda Pública, retenciones y pagos a cuenta", group: 4 },
  { code: "475", name: "Hacienda Pública, acreedora", group: 4 },
  { code: "476", name: "Organismos de la SS, acreedores", group: 4 },
  { code: "477", name: "Hacienda Pública, IVA repercutido", group: 4 },
  { code: "480", name: "Gastos anticipados", group: 4 },
  { code: "485", name: "Ingresos anticipados", group: 4 },
  // Grupo 5 — Cuentas financieras
  { code: "520", name: "Deudas a c/p con entidades de crédito", group: 5 },
  { code: "570", name: "Caja, euros", group: 5 },
  { code: "572", name: "Bancos c/c vista, euros", group: 5 },
  // Grupo 6 — Compras y gastos
  { code: "600", name: "Compras de mercaderías", group: 6, pygLine: "4" },
  { code: "601", name: "Compras de materias primas", group: 6, pygLine: "4" },
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
  { code: "641", name: "Indemnizaciones", group: 6, pygLine: "6" },
  { code: "642", name: "Seguridad Social a cargo de la empresa", group: 6, pygLine: "6" },
  { code: "649", name: "Otros gastos sociales", group: 6, pygLine: "6" },
  { code: "650", name: "Pérdidas de créditos comerciales incobrables", group: 6, pygLine: "7" },
  { code: "662", name: "Intereses de deudas", group: 6, pygLine: "13" },
  { code: "669", name: "Otros gastos financieros", group: 6, pygLine: "13" },
  { code: "680", name: "Amortización del inmovilizado intangible", group: 6, pygLine: "8" },
  { code: "681", name: "Amortización del inmovilizado material", group: 6, pygLine: "8" },
  { code: "694", name: "Pérdidas por deterioro de créditos comerciales", group: 6, pygLine: "7" },
  { code: "6300", name: "Impuesto corriente", group: 6, pygLine: "17" },
  { code: "6301", name: "Impuesto diferido", group: 6, pygLine: "17" },
  // Grupo 7 — Ventas e ingresos
  { code: "700", name: "Ventas de mercaderías", group: 7, pygLine: "1" },
  { code: "701", name: "Ventas de productos terminados", group: 7, pygLine: "1" },
  { code: "705", name: "Prestaciones de servicios", group: 7, pygLine: "1" },
  { code: "706", name: "Descuentos sobre ventas por pronto pago", group: 7, pygLine: "1" },
  { code: "708", name: "Devoluciones de ventas", group: 7, pygLine: "1" },
  { code: "740", name: "Subvenciones a la explotación", group: 7, pygLine: "5" },
  { code: "752", name: "Ingresos por arrendamientos", group: 7, pygLine: "5" },
  { code: "759", name: "Ingresos por servicios diversos", group: 7, pygLine: "5" },
  { code: "762", name: "Ingresos de créditos", group: 7, pygLine: "12" },
  { code: "769", name: "Otros ingresos financieros", group: 7, pygLine: "12" },
  { code: "794", name: "Reversión del deterioro de créditos comerciales", group: 7, pygLine: "7" },
];
