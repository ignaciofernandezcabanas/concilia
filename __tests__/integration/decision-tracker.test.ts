import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildReconciliation, buildBankTransaction, buildInvoice, buildContact, buildLearnedPattern } from '../helpers/factories';

const mockPrisma = vi.hoisted(() => ({
  reconciliation: { findUnique: vi.fn() },
  bankTransaction: { count: vi.fn() },
  controllerDecision: { updateMany: vi.fn(), create: vi.fn() },
  learnedPattern: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { trackControllerDecision } from '@/lib/reconciliation/decision-tracker';

const baseCtx = {
  reconciliationId: 'reco_1',
  bankTransactionId: 'tx_1',
  invoiceId: 'inv_1',
  userId: 'user_1',
  companyId: 'company_1',
  controllerAction: 'approve',
};

const contact = buildContact();
const bankTx = buildBankTransaction({ amount: -300, counterpartIban: contact.iban });
const invoice = buildInvoice({ contact });
const reco = buildReconciliation({
  confidenceScore: 0.95,
  matchReason: 'exact_amount+iban_match',
  difference: null,
  bankTransactionId: 'tx_1',
  invoiceId: 'inv_1',
});

function setupDefaults() {
  mockPrisma.reconciliation.findUnique.mockResolvedValue({
    ...reco,
    bankTransaction: { ...bankTx, reconciliations: [] },
    invoice: { ...invoice, contact },
  });
  mockPrisma.bankTransaction.count.mockResolvedValue(1); // not recurring
  mockPrisma.controllerDecision.updateMany.mockResolvedValue({});
  mockPrisma.controllerDecision.create.mockResolvedValue({});
  mockPrisma.learnedPattern.findFirst.mockResolvedValue(null);
  mockPrisma.learnedPattern.create.mockResolvedValue({});
  mockPrisma.learnedPattern.update.mockResolvedValue({});
}

describe('trackControllerDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  // ── wasModified ──
  it('aprobación sin cambios → wasModified: false', async () => {
    await trackControllerDecision(mockPrisma as any, { ...baseCtx, controllerAction: 'approve' });

    expect(mockPrisma.controllerDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wasModified: false }),
      })
    );
  });

  it('corrección (correctedField presente) → wasModified: true', async () => {
    await trackControllerDecision(mockPrisma as any, {
      ...baseCtx,
      controllerAction: 'classify',
      correctedField: 'accountCode',
      correctedTo: '629',
    });

    expect(mockPrisma.controllerDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wasModified: true }),
      })
    );
  });

  it('reject siempre marca wasModified: true', async () => {
    await trackControllerDecision(mockPrisma as any, { ...baseCtx, controllerAction: 'reject' });

    expect(mockPrisma.controllerDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wasModified: true }),
      })
    );
  });

  // ── Previous decisions marked non-definitive ──
  it('marca decisiones previas como no definitivas', async () => {
    await trackControllerDecision(mockPrisma as any, baseCtx);

    expect(mockPrisma.controllerDecision.updateMany).toHaveBeenCalledWith({
      where: { bankTransactionId: 'tx_1', companyId: 'company_1', isDefinitive: true },
      data: { isDefinitive: false },
    });
  });

  // ── Recurrence detection ──
  it('3+ txs del mismo IBAN en 3 meses → isRecurring: true', async () => {
    mockPrisma.bankTransaction.count.mockResolvedValue(5);

    await trackControllerDecision(mockPrisma as any, baseCtx);

    expect(mockPrisma.controllerDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isRecurring: true }),
      })
    );
  });

  it('< 3 txs del mismo IBAN → isRecurring: false', async () => {
    mockPrisma.bankTransaction.count.mockResolvedValue(2);

    await trackControllerDecision(mockPrisma as any, baseCtx);

    expect(mockPrisma.controllerDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isRecurring: false }),
      })
    );
  });

  // ── Amount range buckets ──
  it.each([
    [50, '0-100'],
    [300, '100-500'],
    [2000, '500-5000'],
    [10000, '5000+'],
  ])('importe %d → amountRange "%s"', async (amount, expected) => {
    mockPrisma.reconciliation.findUnique.mockResolvedValue({
      ...reco,
      bankTransaction: { ...bankTx, amount: -amount, reconciliations: [] },
      invoice: { ...invoice, contact },
    });

    await trackControllerDecision(mockPrisma as any, baseCtx);

    expect(mockPrisma.controllerDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountRange: expected }),
      })
    );
  });

  // ── Calls updateLearnedPattern on correction ──
  it('llama a updateLearnedPattern cuando hay corrección', async () => {
    // Second findUnique call for updateLearnedPattern
    mockPrisma.reconciliation.findUnique
      .mockResolvedValueOnce({
        ...reco,
        bankTransaction: { ...bankTx, reconciliations: [] },
        invoice: { ...invoice, contact },
      })
      .mockResolvedValueOnce({
        ...reco,
        bankTransaction: bankTx,
      });

    await trackControllerDecision(mockPrisma as any, {
      ...baseCtx,
      correctedField: 'differenceReason',
      correctedTo: 'BANK_COMMISSION',
    });

    // Should have tried to find or create a learned pattern
    expect(mockPrisma.learnedPattern.findFirst).toHaveBeenCalled();
  });

  // ── No call to updateLearnedPattern without correction ──
  it('no llama a updateLearnedPattern sin corrección', async () => {
    await trackControllerDecision(mockPrisma as any, { ...baseCtx, controllerAction: 'approve' });
    expect(mockPrisma.learnedPattern.findFirst).not.toHaveBeenCalled();
  });

  // ── Reconciliation not found → returns silently ──
  it('reconciliation no encontrada → no rompe', async () => {
    mockPrisma.reconciliation.findUnique.mockResolvedValue(null);
    await expect(trackControllerDecision(baseCtx)).resolves.not.toThrow();
    expect(mockPrisma.controllerDecision.create).not.toHaveBeenCalled();
  });
});

describe('updateLearnedPattern (via trackControllerDecision)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('patrón nuevo → crea con confidence 1.0, occurrences 1', async () => {
    mockPrisma.reconciliation.findUnique
      .mockResolvedValueOnce({
        ...reco, bankTransaction: { ...bankTx, reconciliations: [] }, invoice: { ...invoice, contact },
      })
      .mockResolvedValueOnce({ ...reco, bankTransaction: bankTx });
    mockPrisma.learnedPattern.findFirst.mockResolvedValue(null);

    await trackControllerDecision(mockPrisma as any, {
      ...baseCtx,
      correctedField: 'differenceReason',
      correctedTo: 'EARLY_PAYMENT',
    });

    expect(mockPrisma.learnedPattern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          predictedAction: 'EARLY_PAYMENT',
          confidence: 1.0,
          occurrences: 1,
          correctPredictions: 1,
        }),
      })
    );
  });

  it('patrón existente con predicción correcta → incrementa correctPredictions', async () => {
    const existing = buildLearnedPattern({
      predictedAction: 'BANK_COMMISSION',
      occurrences: 5,
      correctPredictions: 4,
      confidence: 0.8,
    });

    mockPrisma.reconciliation.findUnique
      .mockResolvedValueOnce({
        ...reco, bankTransaction: { ...bankTx, reconciliations: [] }, invoice: { ...invoice, contact },
      })
      .mockResolvedValueOnce({ ...reco, bankTransaction: bankTx });
    mockPrisma.learnedPattern.findFirst.mockResolvedValue(existing);

    await trackControllerDecision(mockPrisma as any, {
      ...baseCtx,
      correctedField: 'differenceReason',
      correctedTo: 'BANK_COMMISSION', // same as predicted
    });

    expect(mockPrisma.learnedPattern.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          occurrences: { increment: 1 },
          correctPredictions: { increment: 1 },
          confidence: { set: 5 / 6 }, // (4+1)/(5+1)
        }),
      })
    );
  });

  it('patrón existente con predicción incorrecta → actualiza predictedAction', async () => {
    const existing = buildLearnedPattern({
      predictedAction: 'BANK_COMMISSION',
      occurrences: 5,
      correctPredictions: 4,
    });

    mockPrisma.reconciliation.findUnique
      .mockResolvedValueOnce({
        ...reco, bankTransaction: { ...bankTx, reconciliations: [] }, invoice: { ...invoice, contact },
      })
      .mockResolvedValueOnce({ ...reco, bankTransaction: bankTx });
    mockPrisma.learnedPattern.findFirst.mockResolvedValue(existing);

    await trackControllerDecision(mockPrisma as any, {
      ...baseCtx,
      correctedField: 'differenceReason',
      correctedTo: 'EARLY_PAYMENT', // different from predicted
    });

    expect(mockPrisma.learnedPattern.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          occurrences: { increment: 1 },
          predictedAction: 'EARLY_PAYMENT',
          predictedReason: 'EARLY_PAYMENT',
          confidence: { set: 4 / 6 }, // 4/(5+1) — no increment to correctPredictions
        }),
      })
    );
  });
});
