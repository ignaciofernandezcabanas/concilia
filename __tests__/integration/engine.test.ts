import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBankTransaction, buildCompany, buildInvoice, buildContact } from '../helpers/factories';

// ── Mock all dependencies ──
const mockPrisma = vi.hoisted(() => ({
  company: { findUniqueOrThrow: vi.fn() },
  categoryThreshold: { findMany: vi.fn() },
  bankTransaction: { findMany: vi.fn(), update: vi.fn() },
  contact: { findMany: vi.fn() },
  invoice: { findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  reconciliation: { findFirst: vi.fn(), create: vi.fn() },
  bankTransactionClassification: { create: vi.fn() },
  account: { findFirst: vi.fn() },
  matchingRule: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  learnedPattern: { findMany: vi.fn(), update: vi.fn() },
  intercompanyLink: { create: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

const mockDetectInternal = vi.hoisted(() => vi.fn());
const mockDetectIntercompany = vi.hoisted(() => vi.fn());
const mockDetectDuplicates = vi.hoisted(() => vi.fn());
const mockDetectReturn = vi.hoisted(() => vi.fn());
const mockDetectFinancial = vi.hoisted(() => vi.fn());
const mockFindExact = vi.hoisted(() => vi.fn());
const mockFindGrouped = vi.hoisted(() => vi.fn());
const mockFindFuzzy = vi.hoisted(() => vi.fn());
const mockFindLlm = vi.hoisted(() => vi.fn());
const mockClassifyRules = vi.hoisted(() => vi.fn());
const mockClassifyLlm = vi.hoisted(() => vi.fn());

vi.mock('@/lib/reconciliation/detectors/internal-detector', () => ({ detectInternalTransfer: mockDetectInternal }));
vi.mock('@/lib/reconciliation/detectors/intercompany-detector', () => ({ detectIntercompany: mockDetectIntercompany }));
vi.mock('@/lib/reconciliation/detectors/duplicate-detector', () => ({ detectDuplicates: mockDetectDuplicates }));
vi.mock('@/lib/reconciliation/detectors/return-detector', () => ({ detectReturn: mockDetectReturn }));
vi.mock('@/lib/reconciliation/detectors/financial-detector', () => ({ detectFinancialOp: mockDetectFinancial }));
vi.mock('@/lib/reconciliation/matchers/exact-match', () => ({ findExactMatch: mockFindExact }));
vi.mock('@/lib/reconciliation/matchers/grouped-match', () => ({ findGroupedMatch: mockFindGrouped }));
vi.mock('@/lib/reconciliation/matchers/fuzzy-match', () => ({ findFuzzyMatch: mockFindFuzzy }));
vi.mock('@/lib/reconciliation/matchers/llm-match', () => ({ findLlmMatch: mockFindLlm }));
vi.mock('@/lib/reconciliation/classifiers/rule-classifier', () => ({ classifyByRules: mockClassifyRules }));
vi.mock('@/lib/reconciliation/classifiers/llm-classifier', () => ({ classifyByLlm: mockClassifyLlm }));

import { runReconciliation } from '@/lib/reconciliation/engine';

// ── Helper: set up default mocks ──
function setupDefaults(txList = [buildBankTransaction()]) {
  const company = buildCompany({ autoApproveThreshold: 0.90, materialityThreshold: 5000, materialityMinor: 5 });
  mockPrisma.company.findUniqueOrThrow.mockResolvedValue(company);
  mockPrisma.categoryThreshold.findMany.mockResolvedValue([]);
  mockPrisma.bankTransaction.findMany.mockResolvedValue(txList);
  mockPrisma.bankTransaction.update.mockResolvedValue({});
  mockPrisma.contact.findMany.mockResolvedValue([buildContact()]);
  mockPrisma.invoice.findMany.mockResolvedValue([buildInvoice()]);
  mockPrisma.invoice.findUnique.mockResolvedValue(buildInvoice());
  mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(buildInvoice());
  mockPrisma.invoice.update.mockResolvedValue({});
  mockPrisma.reconciliation.findFirst.mockResolvedValue(null); // no existing
  mockPrisma.reconciliation.create.mockResolvedValue({ id: 'reco_new' });
  mockPrisma.learnedPattern.findMany.mockResolvedValue([]);
  mockPrisma.learnedPattern.update.mockResolvedValue({});
  mockPrisma.matchingRule.create.mockResolvedValue({});
  mockPrisma.matchingRule.findFirst.mockResolvedValue(null);

  // Default: nothing detected/matched
  mockDetectInternal.mockResolvedValue({ isInternal: false, ownAccountId: null });
  mockDetectIntercompany.mockResolvedValue({ isIntercompany: false, siblingCompanyId: null, siblingCompanyName: null, organizationId: null });
  mockDetectDuplicates.mockResolvedValue({ isDuplicate: false, groupId: null, relatedTx: [] });
  mockDetectReturn.mockResolvedValue({ isReturn: false, originalTxId: null, originalReconciliationId: null });
  mockDetectFinancial.mockResolvedValue({ isFinancial: false, suggestedPrincipal: null, suggestedInterest: null });
  mockFindExact.mockResolvedValue([]);
  mockFindGrouped.mockResolvedValue(null);
  mockFindFuzzy.mockResolvedValue([]);
  mockFindLlm.mockResolvedValue(null);
  mockClassifyRules.mockResolvedValue(null);
  mockClassifyLlm.mockResolvedValue(null);
}

describe('runReconciliation — Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── No transactions ──
  it('sin transacciones pendientes → resultado vacío', async () => {
    setupDefaults([]);
    const result = await runReconciliation('company_1');
    expect(result.processed).toBe(0);
  });

  // ── Detectors ──
  it('transferencia interna → auto-aprobada, status INTERNAL', async () => {
    setupDefaults();
    mockDetectInternal.mockResolvedValue({ isInternal: true, ownAccountId: 'own_1' });

    const result = await runReconciliation('company_1');
    expect(result.autoApproved).toBe(1);
    expect(result.matched).toBe(1);
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'INTERNAL' }) })
    );
  });

  it('duplicado detectado → bandeja, priority URGENT', async () => {
    setupDefaults();
    mockDetectDuplicates.mockResolvedValue({ isDuplicate: true, groupId: 'g1', relatedTx: [] });

    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1);
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', priority: 'URGENT' }) })
    );
  });

  it('devolución detectada → bandeja, priority URGENT, nunca auto-aprobada', async () => {
    setupDefaults();
    mockDetectReturn.mockResolvedValue({ isReturn: true, originalTxId: 'tx_orig', originalReconciliationId: 'reco_orig' });

    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1);
    expect(result.autoApproved).toBe(0);
  });

  // ── Matchers + auto-approval ──
  it('exact match confidence 0.97, amount 1000, threshold 0.90 → auto-aprobado', async () => {
    const tx = buildBankTransaction({ amount: -1000 });
    setupDefaults([tx]);
    const invoice = buildInvoice({ totalAmount: 1000, contact: buildContact() });
    mockFindExact.mockResolvedValue([{ invoice, confidence: 0.97, matchReason: 'exact' }]);

    const result = await runReconciliation('company_1');
    expect(result.autoApproved).toBe(1);
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RECONCILED' }) })
    );
  });

  it('exact match confidence 0.85, threshold 0.90 → bandeja', async () => {
    setupDefaults();
    const invoice = buildInvoice({ contact: buildContact() });
    mockFindExact.mockResolvedValue([{ invoice, confidence: 0.85, matchReason: 'exact' }]);

    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1);
    expect(result.autoApproved).toBe(0);
  });

  it('exact match confidence 0.99, amount 10000, materiality 5000 → bandeja', async () => {
    const tx = buildBankTransaction({ amount: -10000 });
    setupDefaults([tx]);
    const invoice = buildInvoice({ totalAmount: 10000, contact: buildContact() });
    mockFindExact.mockResolvedValue([{ invoice, confidence: 0.99, matchReason: 'exact' }]);

    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1); // over materiality
  });

  it('fuzzy match confidence 0.82 → bandeja', async () => {
    setupDefaults();
    const invoice = buildInvoice({ contact: buildContact() });
    mockFindFuzzy.mockResolvedValue([{ invoice, confidence: 0.82, matchReason: 'fuzzy', amountDifference: 15, differencePercent: 1.5, suggestedDifferenceReason: 'BANK_COMMISSION' }]);

    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1);
  });

  it('LLM match → bandeja SIEMPRE', async () => {
    setupDefaults();
    mockFindLlm.mockResolvedValue({ invoiceId: 'inv_1', confidence: 0.75, matchReason: 'llm', llmExplanation: 'test' });

    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1);
    expect(result.autoApproved).toBe(0);
  });

  // ── Small difference rule ──
  it('match con difference 3€, materialityMinor 5€, confidence 0.75 → auto-aprobado', async () => {
    setupDefaults();
    const invoice = buildInvoice({ contact: buildContact() });
    mockFindFuzzy.mockResolvedValue([{ invoice, confidence: 0.75, matchReason: 'fuzzy', amountDifference: 3, differencePercent: 0.3, suggestedDifferenceReason: 'BANK_COMMISSION' }]);

    const result = await runReconciliation('company_1');
    expect(result.autoApproved).toBe(1); // isSmallDiff applies
  });

  // ── Ingreso no identificado (scenario 8) ──
  it('tx positiva sin match → bandeja, NUNCA auto-aprobado', async () => {
    const tx = buildBankTransaction({ amount: 500 }); // positive = income
    setupDefaults([tx]);

    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1);
    expect(result.autoApproved).toBe(0);
  });

  // ── Classifiers ──
  it('sin match, rule classifier confidence 0.95 → auto-aprobado, CLASSIFIED', async () => {
    const tx = buildBankTransaction({ amount: -100 });
    setupDefaults([tx]);
    mockClassifyRules.mockResolvedValue({
      accountCode: '629', cashflowType: 'OPERATING', ruleId: 'r1', confidence: 0.95, ruleName: 'test',
    });
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc_1', code: '629', name: 'Otros servicios' });
    mockPrisma.bankTransactionClassification.create.mockResolvedValue({ id: 'class_1' });

    const result = await runReconciliation('company_1');
    expect(result.classified).toBe(1);
    expect(result.autoApproved).toBe(1);
  });

  it('sin match, LLM classifier → bandeja SIEMPRE', async () => {
    const tx = buildBankTransaction({ amount: -100 });
    setupDefaults([tx]);
    mockClassifyLlm.mockResolvedValue({
      accountCode: '629', cashflowType: 'OPERATING', confidence: 0.70, llmExplanation: 'test',
    });
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc_1', code: '629', name: 'Otros servicios' });
    mockPrisma.bankTransactionClassification.create.mockResolvedValue({ id: 'class_1' });

    const result = await runReconciliation('company_1');
    expect(result.classified).toBe(1);
    expect(result.needsReview).toBe(1);
    expect(result.autoApproved).toBe(0);
  });

  // ── Fallback ──
  it('nada encontrado → UNIDENTIFIED, bandeja', async () => {
    setupDefaults();
    const result = await runReconciliation('company_1');
    expect(result.needsReview).toBe(1);
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ detectedType: 'UNIDENTIFIED' }) })
    );
  });

  // ── Idempotency ──
  it('tx con reconciliation PROPOSED existente → skip', async () => {
    setupDefaults();
    mockPrisma.reconciliation.findFirst.mockResolvedValue({ id: 'existing', status: 'PROPOSED' });

    const result = await runReconciliation('company_1');
    expect(result.processed).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.needsReview).toBe(0);
    expect(mockDetectInternal).not.toHaveBeenCalled();
  });

  // ── Multiple transactions ──
  it('5 txs: 2 auto, 2 bandeja, 1 error → contadores correctos', async () => {
    const txs = [
      buildBankTransaction({ id: 'tx_1', amount: -100 }), // will be internal → auto
      buildBankTransaction({ id: 'tx_2', amount: -200 }), // will be exact → auto
      buildBankTransaction({ id: 'tx_3', amount: -300 }), // will be fuzzy → bandeja
      buildBankTransaction({ id: 'tx_4', amount: 400 }),   // positive, no match → bandeja
      buildBankTransaction({ id: 'tx_5', amount: -500 }), // will throw error
    ];
    setupDefaults(txs);

    let callCount = 0;
    mockDetectInternal.mockImplementation(async (tx: { id: string }) => {
      callCount++;
      if (tx.id === 'tx_1') return { isInternal: true, ownAccountId: 'own_1' };
      if (tx.id === 'tx_5') throw new Error('Simulated error');
      return { isInternal: false, ownAccountId: null };
    });

    const invoice = buildInvoice({ contact: buildContact() });
    mockFindExact.mockImplementation(async (tx: { id: string }) => {
      if (tx.id === 'tx_2') return [{ invoice, confidence: 0.97, matchReason: 'exact' }];
      return [];
    });
    mockFindFuzzy.mockImplementation(async (tx: { id: string }) => {
      if (tx.id === 'tx_3') return [{ invoice, confidence: 0.75, matchReason: 'fuzzy', amountDifference: 20, differencePercent: 2, suggestedDifferenceReason: null }];
      return [];
    });

    const result = await runReconciliation('company_1');
    expect(result.processed).toBe(5);
    expect(result.autoApproved).toBe(2); // tx_1 (internal) + tx_2 (exact)
    expect(result.needsReview).toBe(2); // tx_3 (fuzzy) + tx_4 (unidentified)
    expect(result.errors.length).toBe(1); // tx_5
    expect(result.errors[0].txId).toBe('tx_5');
  });
});
