import { describe, it, expect } from 'vitest';
import {
  resolveSchema,
  companySettingsSchema,
  userInviteSchema,
} from '@/lib/utils/validation';

describe('resolveSchema', () => {
  describe('happy paths', () => {
    it('approve', () => {
      const result = resolveSchema.safeParse({ action: 'approve', reconciliationId: 'reco_1' });
      expect(result.success).toBe(true);
    });

    it('reject con reason', () => {
      const result = resolveSchema.safeParse({ action: 'reject', reconciliationId: 'reco_1', reason: 'No es correcto' });
      expect(result.success).toBe(true);
    });

    it('classify con accountCode y cashflowType', () => {
      const result = resolveSchema.safeParse({
        action: 'classify',
        bankTransactionId: 'tx_1',
        accountCode: '629',
        cashflowType: 'OPERATING',
      });
      expect(result.success).toBe(true);
    });

    it('manual_match', () => {
      const result = resolveSchema.safeParse({
        action: 'manual_match',
        bankTransactionId: 'tx_1',
        invoiceId: 'inv_1',
      });
      expect(result.success).toBe(true);
    });

    it('mark_internal', () => {
      const result = resolveSchema.safeParse({ action: 'mark_internal', bankTransactionId: 'tx_1' });
      expect(result.success).toBe(true);
    });

    it('ignore con reason', () => {
      const result = resolveSchema.safeParse({
        action: 'ignore',
        bankTransactionId: 'tx_1',
        reason: 'No relevante',
      });
      expect(result.success).toBe(true);
    });

    it('mark_duplicate', () => {
      const result = resolveSchema.safeParse({
        action: 'mark_duplicate',
        bankTransactionId: 'tx_1',
        duplicateOfId: 'tx_2',
      });
      expect(result.success).toBe(true);
    });

    it('mark_legitimate', () => {
      const result = resolveSchema.safeParse({
        action: 'mark_legitimate',
        duplicateGroupId: 'group_1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('errores', () => {
    it('reject sin reason falla', () => {
      const result = resolveSchema.safeParse({ action: 'reject', reconciliationId: 'reco_1' });
      expect(result.success).toBe(false);
    });

    it('reject con reason vacío falla', () => {
      const result = resolveSchema.safeParse({ action: 'reject', reconciliationId: 'reco_1', reason: '' });
      expect(result.success).toBe(false);
    });

    it('classify sin accountCode falla', () => {
      const result = resolveSchema.safeParse({
        action: 'classify',
        bankTransactionId: 'tx_1',
        cashflowType: 'OPERATING',
      });
      expect(result.success).toBe(false);
    });

    it('cashflowType inválido falla', () => {
      const result = resolveSchema.safeParse({
        action: 'classify',
        bankTransactionId: 'tx_1',
        accountCode: '629',
        cashflowType: 'INVALID',
      });
      expect(result.success).toBe(false);
    });

    it('action desconocida falla', () => {
      const result = resolveSchema.safeParse({ action: 'unknown', reconciliationId: 'reco_1' });
      expect(result.success).toBe(false);
    });

    it('body vacío falla', () => {
      const result = resolveSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('ignore sin reason falla', () => {
      const result = resolveSchema.safeParse({ action: 'ignore', bankTransactionId: 'tx_1' });
      expect(result.success).toBe(false);
    });
  });
});

describe('companySettingsSchema', () => {
  it('CIF persona jurídica pasa', () => {
    const result = companySettingsSchema.safeParse({ cif: 'B12345670' });
    expect(result.success).toBe(true);
  });

  it('NIF persona física pasa', () => {
    const result = companySettingsSchema.safeParse({ cif: '12345678Z' });
    expect(result.success).toBe(true);
  });

  it('NIE pasa', () => {
    const result = companySettingsSchema.safeParse({ cif: 'X1234567A' });
    expect(result.success).toBe(true);
  });

  it('CIF inválido falla', () => {
    const result = companySettingsSchema.safeParse({ cif: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('autoApproveThreshold entre 0-1 pasa', () => {
    expect(companySettingsSchema.safeParse({ autoApproveThreshold: 0.5 }).success).toBe(true);
    expect(companySettingsSchema.safeParse({ autoApproveThreshold: 0 }).success).toBe(true);
    expect(companySettingsSchema.safeParse({ autoApproveThreshold: 1 }).success).toBe(true);
  });

  it('autoApproveThreshold fuera de rango falla', () => {
    expect(companySettingsSchema.safeParse({ autoApproveThreshold: 1.5 }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ autoApproveThreshold: -0.1 }).success).toBe(false);
  });

  it('materialityThreshold negativo falla, cero pasa', () => {
    expect(companySettingsSchema.safeParse({ materialityThreshold: -1 }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ materialityThreshold: 0 }).success).toBe(true);
  });

  it('objeto vacío pasa (todo optional)', () => {
    expect(companySettingsSchema.safeParse({}).success).toBe(true);
  });
});

describe('userInviteSchema', () => {
  it('email válido pasa', () => {
    expect(userInviteSchema.safeParse({ email: 'test@example.com' }).success).toBe(true);
  });

  it('email inválido falla', () => {
    expect(userInviteSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('rol default es EDITOR', () => {
    const result = userInviteSchema.parse({ email: 'test@example.com' });
    expect(result.role).toBe('EDITOR');
  });
});
