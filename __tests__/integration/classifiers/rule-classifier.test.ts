import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBankTransaction, buildMatchingRule } from '../../helpers/factories';

const mockPrisma = vi.hoisted(() => ({
  matchingRule: { findMany: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { classifyByRules } from '@/lib/reconciliation/classifiers/rule-classifier';

describe('classifyByRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.matchingRule.update.mockResolvedValue({});
  });

  it('IBAN_CLASSIFY: match por IBAN → confidence >= 0.95', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'IBAN_CLASSIFY', accountCode: '626' }),
    ]);
    const tx = buildBankTransaction();
    const result = await classifyByRules(tx, 'company_1');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result!.accountCode).toBe('626');
  });

  it('CONCEPT_CLASSIFY con regex válida → match', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'CONCEPT_CLASSIFY', pattern: 'COMISION.*MANT', counterpartIban: null, accountCode: '626' }),
    ]);
    const tx = buildBankTransaction({ concept: 'COMISION MANTENIMIENTO CTA' });
    const result = await classifyByRules(tx, 'company_1');
    expect(result).not.toBeNull();
    expect(result!.accountCode).toBe('626');
  });

  it('CONCEPT_CLASSIFY con regex inválida → fallback a substring', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'CONCEPT_CLASSIFY', pattern: '[invalid(regex', counterpartIban: null, accountCode: '628' }),
    ]);
    const tx = buildBankTransaction({ concept: 'pago con [invalid(regex incluido' });
    const result = await classifyByRules(tx, 'company_1');
    expect(result).not.toBeNull();
  });

  it('CONCEPT_CLASSIFY con conceptContains (sin pattern) → match', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'CONCEPT_CLASSIFY', pattern: null, conceptContains: 'VODAFONE', counterpartIban: null, accountCode: '628' }),
    ]);
    const tx = buildBankTransaction({ concept: 'RECIBO VODAFONE MOVIL' });
    const result = await classifyByRules(tx, 'company_1');
    expect(result).not.toBeNull();
    expect(result!.accountCode).toBe('628');
  });

  it('EXACT_AMOUNT_CONTACT: match por IBAN + rango → confidence >= 0.92', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'EXACT_AMOUNT_CONTACT', minAmount: 900, maxAmount: 1100, accountCode: '629' }),
    ]);
    const tx = buildBankTransaction({ amount: -1000 });
    const result = await classifyByRules(tx, 'company_1');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.92);
  });

  it('EXACT_AMOUNT_CONTACT: importe fuera de rango → null', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'EXACT_AMOUNT_CONTACT', minAmount: 100, maxAmount: 200, accountCode: '629' }),
    ]);
    const tx = buildBankTransaction({ amount: -1000 }); // outside 100-200
    const result = await classifyByRules(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('transactionDirection "income" filtra pagos → null para tx negativa', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'IBAN_CLASSIFY', transactionDirection: 'income', accountCode: '700' }),
    ]);
    const tx = buildBankTransaction({ amount: -500 }); // expense
    const result = await classifyByRules(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('transactionDirection "expense" filtra cobros → null para tx positiva', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'IBAN_CLASSIFY', transactionDirection: 'expense', accountCode: '629' }),
    ]);
    const tx = buildBankTransaction({ amount: 500 }); // income
    const result = await classifyByRules(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('mayor prioridad se aplica primero', async () => {
    // Mock returns in priority desc order (as Prisma orderBy would)
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ id: 'r_high', priority: 10, type: 'IBAN_CLASSIFY', accountCode: '629' }),
      buildMatchingRule({ id: 'r_low', priority: 0, type: 'IBAN_CLASSIFY', accountCode: '620' }),
    ]);
    const tx = buildBankTransaction();
    const result = await classifyByRules(tx, 'company_1');
    expect(result!.accountCode).toBe('629');
  });

  it('sin reglas → null', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([]);
    const tx = buildBankTransaction();
    const result = await classifyByRules(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('actualiza timesApplied y lastExecutedAt al aplicar', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ id: 'r1', type: 'IBAN_CLASSIFY', accountCode: '626' }),
    ]);
    const tx = buildBankTransaction();
    await classifyByRules(tx, 'company_1');

    expect(mockPrisma.matchingRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({
          timesApplied: { increment: 1 },
          lastExecutedAt: expect.any(Date),
        }),
      })
    );
  });

  it('boost de confidence por timesApplied', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'IBAN_CLASSIFY', timesApplied: 100, accountCode: '626' }),
    ]);
    const tx = buildBankTransaction();
    const result = await classifyByRules(tx, 'company_1');
    // Base 0.95 + min(0.04, 100*0.005) = 0.95 + 0.04 = 0.99
    expect(result!.confidence).toBe(0.99);
  });

  it('FINANCIAL_SPLIT solo aplica a pagos (amount < 0)', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'FINANCIAL_SPLIT', accountCode: '170' }),
    ]);
    const tx = buildBankTransaction({ amount: 500 }); // positive
    const result = await classifyByRules(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('filtra por status ACTIVE (no PAUSED)', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([]);
    const tx = buildBankTransaction();
    await classifyByRules(tx, 'company_1');

    expect(mockPrisma.matchingRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', isActive: true }),
      })
    );
  });

  it('counterpartName substring match', async () => {
    mockPrisma.matchingRule.findMany.mockResolvedValue([
      buildMatchingRule({ type: 'IBAN_CLASSIFY', counterpartName: 'PROVEEDOR', accountCode: '629' }),
    ]);
    const tx = buildBankTransaction({ counterpartName: 'PROVEEDOR TEST SL' });
    const result = await classifyByRules(tx, 'company_1');
    expect(result).not.toBeNull();
  });
});
