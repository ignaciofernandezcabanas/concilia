/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedPrisma } from "@/lib/db-scoped";

const DEFAULTS: Record<
  string,
  { debit: string; credit: string; cashflow: string; direction: string }
> = {
  ACTA_JUNTA: {
    debit: "129",
    credit: "112",
    cashflow: "FINANCING",
    direction: "NONE",
  },
  ESCRITURA: {
    debit: "572",
    credit: "100",
    cashflow: "FINANCING",
    direction: "INFLOW",
  },
  CONTRATO_PRESTAMO: {
    debit: "572",
    credit: "170",
    cashflow: "FINANCING",
    direction: "INFLOW",
  },
  RESOLUCION_SUBVENCION: {
    debit: "572",
    credit: "4708",
    cashflow: "FINANCING",
    direction: "INFLOW",
  },
  LIQUIDACION_INTERESES: {
    debit: "662",
    credit: "572",
    cashflow: "OPERATING",
    direction: "OUTFLOW",
  },
  MODELO_FISCAL: {
    debit: "4750",
    credit: "572",
    cashflow: "OPERATING",
    direction: "OUTFLOW",
  },
  RECIBO_NOMINA: {
    debit: "640",
    credit: "572",
    cashflow: "OPERATING",
    direction: "OUTFLOW",
  },
  POLIZA_SEGURO: {
    debit: "625",
    credit: "572",
    cashflow: "OPERATING",
    direction: "OUTFLOW",
  },
  CONTRATO_ALQUILER: {
    debit: "621",
    credit: "572",
    cashflow: "OPERATING",
    direction: "OUTFLOW",
  },
  OTRO: {
    debit: "629",
    credit: "572",
    cashflow: "OPERATING",
    direction: "OUTFLOW",
  },
};

export function getDefaults(type: string) {
  return DEFAULTS[type] ?? DEFAULTS.OTRO;
}

export async function registerSupportingDocument(
  db: ScopedPrisma,
  input: {
    type: string;
    reference?: string;
    description: string;
    date: Date;
    amount: number;
    contactId?: string;
    fileUrl?: string;
    fileName?: string;
    debitAccountCode?: string;
    creditAccountCode?: string;
    cashflowType?: string;
    expectedDirection?: string;
    expectedAmount?: number;
  }
): Promise<{ documentId: string; journalEntryId: string }> {
  const defaults = getDefaults(input.type);
  const debitCode = input.debitAccountCode ?? defaults.debit;
  const creditCode = input.creditAccountCode ?? defaults.credit;

  // Resolve account IDs
  const debitAccount = await db.account.findFirst({
    where: { code: debitCode },
    select: { id: true },
  });
  const creditAccount = await db.account.findFirst({
    where: { code: creditCode },
    select: { id: true },
  });
  if (!debitAccount || !creditAccount) {
    throw new Error(`Account ${debitCode} or ${creditCode} not found`);
  }

  const lastEntry = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const doc = await (db as any).supportingDocument.create({
    data: {
      type: input.type,
      reference: input.reference,
      description: input.description,
      date: input.date,
      amount: input.amount,
      contactId: input.contactId,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      debitAccountCode: debitCode,
      creditAccountCode: creditCode,
      cashflowType: input.cashflowType ?? defaults.cashflow,
      expectedDirection: input.expectedDirection ?? defaults.direction,
      expectedAmount: input.expectedAmount,
      status: "PENDING_APPROVAL",
    },
  });

  const je = await (db as any).journalEntry.create({
    data: {
      number: (lastEntry?.number ?? 0) + 1,
      date: input.date,
      description: `${input.type} — ${input.description}`,
      status: "DRAFT",
      type: "ADJUSTMENT",
      lines: {
        create: [
          {
            accountId: debitAccount.id,
            description: input.description,
            debit: input.amount,
            credit: 0,
          },
          {
            accountId: creditAccount.id,
            description: input.description,
            debit: 0,
            credit: input.amount,
          },
        ],
      },
    },
  });

  await (db as any).supportingDocument.update({
    where: { id: doc.id },
    data: { journalEntryId: je.id },
  });

  return { documentId: doc.id, journalEntryId: je.id };
}
