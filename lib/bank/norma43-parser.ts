/**
 * Parser for Cuaderno 43 (Norma 43) bank statement files.
 *
 * AEB standard format used by Spanish banks. Fixed-length records (80 chars):
 * - Type 11: Account header (bank, branch, account, currency, opening balance)
 * - Type 22: Transaction (date, sign, amount, concept)
 * - Type 23: Supplementary concept (appended to last type 22)
 * - Type 33: Account footer (closing balance)
 * - Type 88: File footer
 */

export interface N43Transaction {
  date: Date;
  amount: number;
  concept: string;
  reference: string;
}

export interface N43Result {
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  currency: string;
  initialBalance: number;
  finalBalance: number;
  transactions: N43Transaction[];
}

const CURRENCY_MAP: Record<string, string> = {
  "978": "EUR",
  "840": "USD",
  "826": "GBP",
};

export function parseNorma43(content: string): N43Result {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    throw new Error("Archivo N43 vacío.");
  }

  // Find header (type 11)
  const headerLine = lines.find((l) => l.startsWith("11"));
  if (!headerLine) {
    throw new Error("Archivo N43 inválido: no se encontró cabecera (tipo 11).");
  }

  const bankCode = headerLine.slice(2, 6);
  const branchCode = headerLine.slice(6, 10);
  const accountNumber = headerLine.slice(10, 20);
  const currencyCode = headerLine.slice(47, 50);
  const currency = CURRENCY_MAP[currencyCode] ?? currencyCode;

  // Opening balance: sign at pos 32 (2=credit/positive), amount at pos 33-47 (cents)
  const openingSign = headerLine[32] === "1" ? -1 : 1;
  const openingCents = parseInt(headerLine.slice(33, 47)) || 0;
  const initialBalance = (openingCents / 100) * openingSign;

  // Parse transactions
  const transactions: N43Transaction[] = [];
  let currentConcept = "";

  for (const line of lines) {
    const type = line.slice(0, 2);

    if (type === "22") {
      // Transaction record
      // Date: positions 10-16 (DDMMYY for operation date)
      const dateStr = line.slice(10, 16); // DDMMYY
      const day = parseInt(dateStr.slice(0, 2));
      const month = parseInt(dateStr.slice(2, 4)) - 1;
      const year = 2000 + parseInt(dateStr.slice(4, 6));
      const date = new Date(year, month, day);

      // Sign: position 27 (1=debit/cargo, 2=credit/abono)
      const sign = line[27] === "1" ? -1 : 1;

      // Amount: positions 28-42 (in cents, 14 digits)
      const amountCents = parseInt(line.slice(28, 42)) || 0;
      const amount = (amountCents / 100) * sign;

      // Reference: positions 42-46
      const reference = line.slice(42, 46).trim();

      // Concept: positions 46-80
      currentConcept = line.slice(46, 80).trim();

      transactions.push({ date, amount, concept: currentConcept, reference });
    } else if (type === "23") {
      // Supplementary concept — append to last transaction
      if (transactions.length > 0) {
        const supplement = line.slice(16, 80).trim();
        if (supplement) {
          transactions[transactions.length - 1].concept += " " + supplement;
        }
      }
    }
  }

  // Closing balance from type 33
  let finalBalance = initialBalance;
  const footerLine = lines.find((l) => l.startsWith("33"));
  if (footerLine) {
    const closingSign = footerLine[20] === "1" ? -1 : 1;
    const closingCents = parseInt(footerLine.slice(21, 35)) || 0;
    finalBalance = (closingCents / 100) * closingSign;
  }

  return {
    bankCode,
    branchCode,
    accountNumber,
    currency,
    initialBalance,
    finalBalance,
    transactions,
  };
}

/**
 * Detect if content is Norma43 format.
 * Returns true if the first non-empty line starts with "11" (header record).
 */
export function isNorma43(content: string): boolean {
  const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0);
  return !!firstLine && firstLine.startsWith("11") && firstLine.length >= 70;
}
