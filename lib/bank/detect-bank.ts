/**
 * Spanish bank detection from IBAN entity code (digits 5-8).
 * Also provides PGC account code suggestion per bank account type.
 */

const SPANISH_BANKS: Record<string, { name: string; bic: string }> = {
  "0049": { name: "Santander", bic: "BSCHESMMXXX" },
  "2100": { name: "CaixaBank", bic: "CAIXESBBXXX" },
  "0182": { name: "BBVA", bic: "BBVAESMMXXX" },
  "0081": { name: "Sabadell", bic: "BSABESBBXXX" },
  "0128": { name: "Bankinter", bic: "BKBKESMMXXX" },
  "1465": { name: "ING", bic: "INGDESMMXXX" },
  "0075": { name: "Popular (Santander)", bic: "POPUESMMXXX" },
  "2085": { name: "Ibercaja", bic: "CAZABORAXXX" },
  "2095": { name: "Kutxabank", bic: "BASABORAXXX" },
  "0487": { name: "Unicaja", bic: "UCJAES2MXXX" },
  "2080": { name: "Abanca", bic: "CAABORAXXX" },
  "0073": { name: "Openbank", bic: "OPENESMMXXX" },
  "1491": { name: "Triodos", bic: "TRIOESMMXXX" },
  "0065": { name: "Barclays (CaixaBank)", bic: "BARCESMMXXX" },
  "0019": { name: "Deutsche Bank", bic: "DEUTESBBXXX" },
  "0186": { name: "Mediolanum", bic: "BFIVESBBXXX" },
  "2038": { name: "Bankia (CaixaBank)", bic: "CAABORAXXX" },
  "0078": { name: "Banca March", bic: "BMABORAXXX" },
  "2103": { name: "Unicaja (ex-Liberbank)", bic: "UCJAES2MXXX" },
  "0061": { name: "Banca Pueyo", bic: "BPUYES21XXX" },
  "2048": { name: "Liberbank (Unicaja)", bic: "UCJAES2MXXX" },
  "0031": { name: "Evo Banco", bic: "ETOSES21XXX" },
  "0239": { name: "EVO Finance", bic: "ELABORAXXX" },
  "0234": { name: "Caminos", bic: "CABORAXXX" },
  "3058": { name: "Cajamar", bic: "CCABORAXXX" },
  "3085": { name: "Caja Rural Central", bic: "BCOEESMMXXX" },
  "3191": { name: "Caja Rural del Sur", bic: "BCOEESMMXXX" },
  "0237": { name: "Cajasur (Kutxabank)", bic: "CSURES2CXXX" },
};

export function detectBankFromIBAN(iban: string): { bankName: string; bic: string } | null {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!cleaned.startsWith("ES") || cleaned.length !== 24) return null;
  const entityCode = cleaned.substring(4, 8);
  const entry = SPANISH_BANKS[entityCode];
  if (!entry) return null;
  return { bankName: entry.name, bic: entry.bic };
}

const PGC_PREFIXES: Record<string, string> = {
  CHECKING: "57200",
  SAVINGS: "57100",
  CREDIT_LINE: "52010",
  LOAN: "17000",
  CREDIT_CARD: "52660",
  CONFIRMING: "52130",
  FACTORING: "43100",
};

export function suggestPGCAccount(type: string, existingCodes: string[]): string {
  const prefix = PGC_PREFIXES[type] || "57200";
  let idx = 1;
  while (existingCodes.includes(`${prefix}${idx.toString().padStart(2, "0")}`)) {
    idx++;
  }
  return `${prefix}${idx.toString().padStart(2, "0")}`;
}
