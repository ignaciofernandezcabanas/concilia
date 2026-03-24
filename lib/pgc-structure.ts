/**
 * Estructura completa del PGC PYMEs (2007):
 * - Cuenta de Pérdidas y Ganancias
 * - Estado de Flujos de Efectivo
 * - Balance de Situación
 *
 * Cada partida incluye los códigos de cuenta PGC entre paréntesis.
 */

// ══════════════════════════════════════════════════════════════
// Shared types
// ══════════════════════════════════════════════════════════════

export interface PgcLineTemplate {
  code: string;
  label: string;
  accounts?: string; // Códigos PGC para mostrar entre paréntesis
  type: "section" | "line" | "sub" | "result" | "ebitda" | "total";
  indent?: number;
}

// ══════════════════════════════════════════════════════════════
// PyG — Cuenta de Pérdidas y Ganancias
// ══════════════════════════════════════════════════════════════

export const PYG_STRUCTURE: PgcLineTemplate[] = [
  { code: "A", label: "A) OPERACIONES CONTINUADAS", type: "section" },

  { code: "1", label: "1. Importe neto de la cifra de negocios", type: "line" },
  { code: "1a", label: "a) Ventas", accounts: "700, 701, 702, 703, 704", type: "sub" },
  { code: "1b", label: "b) Prestaciones de servicios", accounts: "705", type: "sub" },
  {
    code: "1c",
    label: "c) Devoluciones y rappels sobre ventas",
    accounts: "706, 708, 709",
    type: "sub",
  },

  {
    code: "2",
    label: "2. Variación de existencias de PT y en curso",
    accounts: "6930, 71*, 7930",
    type: "line",
  },
  {
    code: "3",
    label: "3. Trabajos realizados por la empresa para su activo",
    accounts: "73*",
    type: "line",
  },

  { code: "4", label: "4. Aprovisionamientos", type: "line" },
  {
    code: "4a",
    label: "a) Consumo de mercaderías",
    accounts: "600, 6060, 6080, 6090, 610*",
    type: "sub",
  },
  {
    code: "4b",
    label: "b) Consumo de materias primas y otros",
    accounts: "601, 602, 6061, 6062",
    type: "sub",
  },
  { code: "4c", label: "c) Trabajos realizados por otras empresas", accounts: "607", type: "sub" },
  {
    code: "4d",
    label: "d) Deterioro de mercaderías y materias primas",
    accounts: "6931, 6932, 6933, 793*",
    type: "sub",
  },

  { code: "5", label: "5. Otros ingresos de explotación", type: "line" },
  {
    code: "5a",
    label: "a) Ingresos accesorios y otros de gestión corriente",
    accounts: "75*",
    type: "sub",
  },
  {
    code: "5b",
    label: "b) Subvenciones de explotación incorporadas al resultado",
    accounts: "740, 747",
    type: "sub",
  },

  { code: "6", label: "6. Gastos de personal", type: "line" },
  {
    code: "6a",
    label: "a) Sueldos, salarios y asimilados",
    accounts: "640, 641, 6450",
    type: "sub",
  },
  { code: "6b", label: "b) Cargas sociales", accounts: "642, 643, 649", type: "sub" },
  { code: "6c", label: "c) Provisiones", accounts: "644, 6457, 7950, 7957", type: "sub" },

  { code: "7", label: "7. Otros gastos de explotación", type: "line" },
  { code: "7a", label: "a) Servicios exteriores", accounts: "62*", type: "sub" },
  { code: "7b", label: "b) Tributos", accounts: "631, 634, 636, 639", type: "sub" },
  {
    code: "7c",
    label: "c) Pérdidas, deterioro y variación de provisiones comerciales",
    accounts: "650, 694, 695, 794, 7954",
    type: "sub",
  },
  { code: "7d", label: "d) Otros gastos de gestión corriente", accounts: "651, 659", type: "sub" },

  { code: "EBITDA", label: "EBITDA (informativo, no PGC)", type: "ebitda" },

  { code: "8", label: "8. Amortización del inmovilizado", accounts: "680, 681, 682", type: "line" },
  {
    code: "9",
    label: "9. Imputación de subvenciones de inmovilizado no financiero",
    accounts: "746",
    type: "line",
  },
  {
    code: "10",
    label: "10. Excesos de provisiones",
    accounts: "7951, 7952, 7955, 7956",
    type: "line",
  },

  {
    code: "11",
    label: "11. Deterioro y resultado por enajenaciones del inmovilizado",
    type: "line",
  },
  {
    code: "11a",
    label: "a) Deterioros y pérdidas",
    accounts: "690, 691, 692, 790, 791, 792",
    type: "sub",
  },
  {
    code: "11b",
    label: "b) Resultados por enajenaciones y otras",
    accounts: "670, 671, 672, 770, 771, 772",
    type: "sub",
  },

  { code: "A.1", label: "A.1) RESULTADO DE EXPLOTACIÓN", type: "result" },

  { code: "12", label: "12. Ingresos financieros", type: "line" },
  {
    code: "12a",
    label: "a) De participaciones en instrumentos de patrimonio",
    accounts: "7600, 7601",
    type: "sub",
  },
  {
    code: "12b",
    label: "b) De valores negociables y otros instrumentos financieros",
    accounts: "7602, 7603, 761, 762, 769",
    type: "sub",
  },

  { code: "13", label: "13. Gastos financieros", type: "line" },
  {
    code: "13a",
    label: "a) Por deudas con empresas del grupo y asociadas",
    accounts: "6610, 6615, 6620, 6640",
    type: "sub",
  },
  {
    code: "13b",
    label: "b) Por deudas con terceros",
    accounts: "6611, 6616, 6621, 6641, 664, 669",
    type: "sub",
  },

  {
    code: "14",
    label: "14. Variación de valor razonable en instrumentos financieros",
    accounts: "663, 763",
    type: "line",
  },
  { code: "15", label: "15. Diferencias de cambio", accounts: "668, 768", type: "line" },

  {
    code: "16",
    label: "16. Deterioro y resultado por enajenaciones de instrumentos financieros",
    type: "line",
  },
  {
    code: "16a",
    label: "a) Deterioros y pérdidas",
    accounts: "696, 697, 698, 699, 796, 797, 798, 799",
    type: "sub",
  },
  {
    code: "16b",
    label: "b) Resultados por enajenaciones y otras",
    accounts: "666, 667, 673, 675, 766, 773, 775",
    type: "sub",
  },

  { code: "A.2", label: "A.2) RESULTADO FINANCIERO", type: "result" },
  { code: "A.3", label: "A.3) RESULTADO ANTES DE IMPUESTOS", type: "result" },
  {
    code: "17",
    label: "17. Impuestos sobre beneficios",
    accounts: "6300, 6301, 633, 638",
    type: "line",
  },
  { code: "A.4", label: "A.4) RESULTADO DEL EJERCICIO", type: "result" },
];

// ══════════════════════════════════════════════════════════════
// EFE — Estado de Flujos de Efectivo
// ══════════════════════════════════════════════════════════════

export const EFE_STRUCTURE: PgcLineTemplate[] = [
  { code: "A", label: "A) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE EXPLOTACIÓN", type: "section" },
  { code: "A.1", label: "1. Resultado del ejercicio antes de impuestos", type: "line", indent: 1 },
  { code: "A.2", label: "2. Ajustes del resultado", type: "line", indent: 1 },
  {
    code: "A.2a",
    label: "a) Amortización del inmovilizado (+)",
    accounts: "680, 681, 682",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2b",
    label: "b) Correcciones valorativas por deterioro (+/−)",
    accounts: "690-699, 790-799",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2c",
    label: "c) Variación de provisiones (+/−)",
    accounts: "14*",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2d",
    label: "d) Imputación de subvenciones (−)",
    accounts: "746",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2e",
    label: "e) Resultados por bajas y enajenaciones del inmovilizado (+/−)",
    accounts: "670-672, 770-772",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2f",
    label: "f) Resultados por bajas de instrumentos financieros (+/−)",
    accounts: "666, 667, 766",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2g",
    label: "g) Ingresos financieros (−)",
    accounts: "760, 761, 762, 769",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2h",
    label: "h) Gastos financieros (+)",
    accounts: "661, 662, 664, 665, 669",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2i",
    label: "i) Diferencias de cambio (+/−)",
    accounts: "668, 768",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.2j",
    label: "j) Variación de valor razonable en instrumentos financieros (+/−)",
    accounts: "663, 763",
    type: "sub",
    indent: 2,
  },
  { code: "A.2k", label: "k) Otros ingresos y gastos (−/+)", type: "sub", indent: 2 },
  { code: "A.3", label: "3. Cambios en el capital corriente", type: "line", indent: 1 },
  { code: "A.3a", label: "a) Existencias (+/−)", accounts: "30*-39*", type: "sub", indent: 2 },
  {
    code: "A.3b",
    label: "b) Deudores y otras cuentas a cobrar (+/−)",
    accounts: "43*, 44*",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.3c",
    label: "c) Otros activos corrientes (+/−)",
    accounts: "48*",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.3d",
    label: "d) Acreedores y otras cuentas a pagar (+/−)",
    accounts: "40*, 41*",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.3e",
    label: "e) Otros pasivos corrientes (+/−)",
    accounts: "485, 568",
    type: "sub",
    indent: 2,
  },
  { code: "A.4", label: "4. Otros flujos de efectivo de explotación", type: "line", indent: 1 },
  {
    code: "A.4a",
    label: "a) Pagos de intereses (−)",
    accounts: "661, 662",
    type: "sub",
    indent: 2,
  },
  { code: "A.4b", label: "b) Cobros de dividendos (+)", accounts: "760", type: "sub", indent: 2 },
  {
    code: "A.4c",
    label: "c) Cobros de intereses (+)",
    accounts: "761, 762",
    type: "sub",
    indent: 2,
  },
  {
    code: "A.4d",
    label: "d) Cobros (pagos) por impuesto sobre beneficios (+/−)",
    accounts: "473, 4709",
    type: "sub",
    indent: 2,
  },
  { code: "A.5", label: "5. Flujos de efectivo de las actividades de explotación", type: "total" },

  { code: "B", label: "B) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE INVERSIÓN", type: "section" },
  { code: "B.6", label: "6. Pagos por inversiones (−)", type: "line", indent: 1 },
  {
    code: "B.6a",
    label: "a) Empresas del grupo y asociadas",
    accounts: "24*",
    type: "sub",
    indent: 2,
  },
  { code: "B.6b", label: "b) Inmovilizado intangible", accounts: "20*", type: "sub", indent: 2 },
  { code: "B.6c", label: "c) Inmovilizado material", accounts: "21*", type: "sub", indent: 2 },
  { code: "B.6d", label: "d) Inversiones inmobiliarias", accounts: "22*", type: "sub", indent: 2 },
  { code: "B.6e", label: "e) Otros activos financieros", accounts: "25*", type: "sub", indent: 2 },
  { code: "B.7", label: "7. Cobros por desinversiones (+)", type: "line", indent: 1 },
  {
    code: "B.7a",
    label: "a) Empresas del grupo y asociadas",
    accounts: "24*",
    type: "sub",
    indent: 2,
  },
  { code: "B.7b", label: "b) Inmovilizado intangible", accounts: "20*", type: "sub", indent: 2 },
  { code: "B.7c", label: "c) Inmovilizado material", accounts: "21*", type: "sub", indent: 2 },
  { code: "B.7d", label: "d) Inversiones inmobiliarias", accounts: "22*", type: "sub", indent: 2 },
  { code: "B.7e", label: "e) Otros activos financieros", accounts: "25*", type: "sub", indent: 2 },
  { code: "B.8", label: "8. Flujos de efectivo de las actividades de inversión", type: "total" },

  { code: "C", label: "C) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE FINANCIACIÓN", type: "section" },
  {
    code: "C.9",
    label: "9. Cobros y pagos por instrumentos de patrimonio",
    type: "line",
    indent: 1,
  },
  {
    code: "C.9a",
    label: "a) Emisión de instrumentos de patrimonio (+)",
    accounts: "10*",
    type: "sub",
    indent: 2,
  },
  {
    code: "C.9b",
    label: "b) Amortización de instrumentos de patrimonio (−)",
    accounts: "10*",
    type: "sub",
    indent: 2,
  },
  {
    code: "C.9c",
    label: "c) Subvenciones, donaciones y legados recibidos (+)",
    accounts: "13*",
    type: "sub",
    indent: 2,
  },
  {
    code: "C.10",
    label: "10. Cobros y pagos por instrumentos de pasivo financiero",
    type: "line",
    indent: 1,
  },
  {
    code: "C.10a",
    label: "a) Emisión de deudas con entidades de crédito (+)",
    accounts: "170, 520",
    type: "sub",
    indent: 2,
  },
  {
    code: "C.10b",
    label: "b) Emisión de otras deudas (+)",
    accounts: "171, 173, 521, 523",
    type: "sub",
    indent: 2,
  },
  {
    code: "C.10c",
    label: "c) Devolución de deudas con entidades de crédito (−)",
    accounts: "170, 520",
    type: "sub",
    indent: 2,
  },
  {
    code: "C.10d",
    label: "d) Devolución de otras deudas (−)",
    accounts: "171, 173, 521, 523",
    type: "sub",
    indent: 2,
  },
  { code: "C.11", label: "11. Pagos por dividendos y remuneraciones", type: "line", indent: 1 },
  { code: "C.11a", label: "a) Dividendos (−)", accounts: "526, 557", type: "sub", indent: 2 },
  {
    code: "C.12",
    label: "12. Flujos de efectivo de las actividades de financiación",
    type: "total",
  },

  {
    code: "D",
    label: "D) Efecto de las variaciones de los tipos de cambio",
    type: "line",
    indent: 0,
  },
  { code: "E", label: "E) AUMENTO/DISMINUCIÓN NETA DEL EFECTIVO", type: "total" },
  {
    code: "F1",
    label: "Efectivo y equivalentes al comienzo del ejercicio",
    accounts: "57*",
    type: "line",
    indent: 0,
  },
  {
    code: "F2",
    label: "Efectivo y equivalentes al final del ejercicio",
    accounts: "57*",
    type: "line",
    indent: 0,
  },
];

// ══════════════════════════════════════════════════════════════
// Balance de Situación
// ══════════════════════════════════════════════════════════════

export const BALANCE_STRUCTURE: PgcLineTemplate[] = [
  // ── ACTIVO ──
  { code: "ACTIVO", label: "ACTIVO", type: "section" },

  { code: "ANC", label: "A) ACTIVO NO CORRIENTE", type: "result" },
  { code: "ANC.I", label: "I. Inmovilizado intangible", accounts: "20*", type: "line", indent: 1 },
  { code: "ANC.I.1", label: "1. Desarrollo", accounts: "200", type: "sub", indent: 2 },
  { code: "ANC.I.2", label: "2. Concesiones", accounts: "202", type: "sub", indent: 2 },
  {
    code: "ANC.I.3",
    label: "3. Patentes, licencias, marcas y similares",
    accounts: "203",
    type: "sub",
    indent: 2,
  },
  { code: "ANC.I.4", label: "4. Fondo de comercio", accounts: "204", type: "sub", indent: 2 },
  {
    code: "ANC.I.5",
    label: "5. Aplicaciones informáticas",
    accounts: "206",
    type: "sub",
    indent: 2,
  },
  {
    code: "ANC.I.6",
    label: "6. Otro inmovilizado intangible",
    accounts: "205, 209",
    type: "sub",
    indent: 2,
  },
  { code: "ANC.II", label: "II. Inmovilizado material", accounts: "21*", type: "line", indent: 1 },
  {
    code: "ANC.II.1",
    label: "1. Terrenos y construcciones",
    accounts: "210, 211",
    type: "sub",
    indent: 2,
  },
  {
    code: "ANC.II.2",
    label: "2. Instalaciones técnicas y otro inmovilizado material",
    accounts: "212, 213, 214, 215, 216, 217, 218, 219",
    type: "sub",
    indent: 2,
  },
  {
    code: "ANC.II.3",
    label: "3. Inmovilizado en curso y anticipos",
    accounts: "23*",
    type: "sub",
    indent: 2,
  },
  {
    code: "ANC.III",
    label: "III. Inversiones inmobiliarias",
    accounts: "22*",
    type: "line",
    indent: 1,
  },
  {
    code: "ANC.IV",
    label: "IV. Inversiones en empresas del grupo y asociadas a l/p",
    accounts: "24*",
    type: "line",
    indent: 1,
  },
  {
    code: "ANC.V",
    label: "V. Inversiones financieras a largo plazo",
    accounts: "25*, 26*",
    type: "line",
    indent: 1,
  },
  {
    code: "ANC.VI",
    label: "VI. Activos por impuesto diferido",
    accounts: "474",
    type: "line",
    indent: 1,
  },

  { code: "AC", label: "B) ACTIVO CORRIENTE", type: "result" },
  { code: "AC.I", label: "I. Existencias", accounts: "30*-39*", type: "line", indent: 1 },
  {
    code: "AC.II",
    label: "II. Deudores comerciales y otras cuentas a cobrar",
    type: "line",
    indent: 1,
  },
  {
    code: "AC.II.1",
    label: "1. Clientes por ventas y prestaciones de servicios",
    accounts: "430, 431, 432, 435, 436",
    type: "sub",
    indent: 2,
  },
  {
    code: "AC.II.2",
    label: "2. Accionistas (socios) por desembolsos exigidos",
    accounts: "5580",
    type: "sub",
    indent: 2,
  },
  {
    code: "AC.II.3",
    label: "3. Otros deudores",
    accounts: "44*, 460, 470, 471, 472",
    type: "sub",
    indent: 2,
  },
  {
    code: "AC.III",
    label: "III. Inversiones en empresas del grupo y asociadas a c/p",
    accounts: "53*",
    type: "line",
    indent: 1,
  },
  {
    code: "AC.IV",
    label: "IV. Inversiones financieras a corto plazo",
    accounts: "54*, 545, 548, 551, 558",
    type: "line",
    indent: 1,
  },
  {
    code: "AC.V",
    label: "V. Periodificaciones a corto plazo",
    accounts: "480, 567",
    type: "line",
    indent: 1,
  },
  {
    code: "AC.VI",
    label: "VI. Efectivo y otros activos líquidos equivalentes",
    accounts: "57*",
    type: "line",
    indent: 1,
  },

  { code: "TOTAL_ACTIVO", label: "TOTAL ACTIVO (A+B)", type: "total" },

  // ── PATRIMONIO NETO Y PASIVO ──
  { code: "PNP", label: "PATRIMONIO NETO Y PASIVO", type: "section" },

  { code: "PN", label: "A) PATRIMONIO NETO", type: "result" },
  { code: "PN.1", label: "A-1) Fondos propios", type: "line", indent: 1 },
  { code: "PN.1.I", label: "I. Capital", accounts: "100, 101, 102", type: "sub", indent: 2 },
  { code: "PN.1.II", label: "II. Prima de emisión", accounts: "110", type: "sub", indent: 2 },
  {
    code: "PN.1.III",
    label: "III. Reservas",
    accounts: "112, 113, 114, 115, 119",
    type: "sub",
    indent: 2,
  },
  {
    code: "PN.1.IV",
    label: "IV. (Acciones y participaciones en patrimonio propias)",
    accounts: "108, 109",
    type: "sub",
    indent: 2,
  },
  {
    code: "PN.1.V",
    label: "V. Resultados de ejercicios anteriores",
    accounts: "120, 121",
    type: "sub",
    indent: 2,
  },
  {
    code: "PN.1.VI",
    label: "VI. Otras aportaciones de socios",
    accounts: "118",
    type: "sub",
    indent: 2,
  },
  {
    code: "PN.1.VII",
    label: "VII. Resultado del ejercicio",
    accounts: "129",
    type: "sub",
    indent: 2,
  },
  {
    code: "PN.1.VIII",
    label: "VIII. (Dividendo a cuenta)",
    accounts: "557",
    type: "sub",
    indent: 2,
  },
  {
    code: "PN.2",
    label: "A-2) Subvenciones, donaciones y legados recibidos",
    accounts: "13*",
    type: "line",
    indent: 1,
  },

  { code: "PNC", label: "B) PASIVO NO CORRIENTE", type: "result" },
  {
    code: "PNC.I",
    label: "I. Provisiones a largo plazo",
    accounts: "14*",
    type: "line",
    indent: 1,
  },
  {
    code: "PNC.II",
    label: "II. Deudas a largo plazo",
    accounts: "17*, 18*",
    type: "line",
    indent: 1,
  },
  {
    code: "PNC.II.1",
    label: "1. Deudas con entidades de crédito",
    accounts: "170",
    type: "sub",
    indent: 2,
  },
  {
    code: "PNC.II.2",
    label: "2. Acreedores por arrendamiento financiero",
    accounts: "174",
    type: "sub",
    indent: 2,
  },
  {
    code: "PNC.II.3",
    label: "3. Otras deudas a largo plazo",
    accounts: "171, 172, 173, 175, 176, 177, 178, 179, 180, 185",
    type: "sub",
    indent: 2,
  },
  {
    code: "PNC.III",
    label: "III. Deudas con empresas del grupo y asociadas a l/p",
    accounts: "16*",
    type: "line",
    indent: 1,
  },

  { code: "PC", label: "C) PASIVO CORRIENTE", type: "result" },
  {
    code: "PC.I",
    label: "I. Provisiones a corto plazo",
    accounts: "499, 529",
    type: "line",
    indent: 1,
  },
  {
    code: "PC.II",
    label: "II. Deudas a corto plazo",
    accounts: "50*, 51*, 52*, 55*, 560",
    type: "line",
    indent: 1,
  },
  {
    code: "PC.II.1",
    label: "1. Deudas con entidades de crédito",
    accounts: "520, 5200",
    type: "sub",
    indent: 2,
  },
  {
    code: "PC.II.2",
    label: "2. Acreedores por arrendamiento financiero",
    accounts: "524",
    type: "sub",
    indent: 2,
  },
  {
    code: "PC.II.3",
    label: "3. Otras deudas a corto plazo",
    accounts: "521, 522, 523, 525, 526, 528, 551, 5525, 555, 5565, 5566",
    type: "sub",
    indent: 2,
  },
  {
    code: "PC.III",
    label: "III. Deudas con empresas del grupo y asociadas a c/p",
    accounts: "51*",
    type: "line",
    indent: 1,
  },
  {
    code: "PC.IV",
    label: "IV. Acreedores comerciales y otras cuentas a pagar",
    type: "line",
    indent: 1,
  },
  {
    code: "PC.IV.1",
    label: "1. Proveedores",
    accounts: "400, 401, 403, 404, 405",
    type: "sub",
    indent: 2,
  },
  {
    code: "PC.IV.2",
    label: "2. Otros acreedores",
    accounts: "41*, 465, 475, 476, 477",
    type: "sub",
    indent: 2,
  },
  {
    code: "PC.V",
    label: "V. Periodificaciones a corto plazo",
    accounts: "485, 568",
    type: "line",
    indent: 1,
  },

  { code: "TOTAL_PNP", label: "TOTAL PATRIMONIO NETO Y PASIVO (A+B+C)", type: "total" },
];
