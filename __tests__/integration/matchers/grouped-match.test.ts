import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBankTransaction, buildInvoice, buildContact } from '../../helpers/factories';

const mockPrisma = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  invoice: { findMany: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { findGroupedMatch } from '@/lib/reconciliation/matchers/grouped-match';

describe('findGroupedMatch', () => {
  const contact = buildContact();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encuentra combinación de 2 facturas que suman el importe', async () => {
    const inv1 = buildInvoice({ id: 'i1', totalAmount: 600, type: 'RECEIVED', contact });
    const inv2 = buildInvoice({ id: 'i2', totalAmount: 400, type: 'RECEIVED', contact });
    const tx = buildBankTransaction({ amount: -1000 });

    mockPrisma.contact.findFirst.mockResolvedValue(contact);
    mockPrisma.invoice.findMany.mockResolvedValue([inv1, inv2]);

    const result = await findGroupedMatch(tx, 'company_1');
    expect(result).not.toBeNull();
    expect(result!.invoices.length).toBe(2);
    expect(result!.totalAmount).toBeCloseTo(1000, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('confidence 0.95 para 2 facturas', async () => {
    const inv1 = buildInvoice({ id: 'i1', totalAmount: 700, type: 'RECEIVED', contact });
    const inv2 = buildInvoice({ id: 'i2', totalAmount: 300, type: 'RECEIVED', contact });
    const tx = buildBankTransaction({ amount: -1000 });

    mockPrisma.contact.findFirst.mockResolvedValue(contact);
    mockPrisma.invoice.findMany.mockResolvedValue([inv1, inv2]);

    const result = await findGroupedMatch(tx, 'company_1');
    expect(result!.confidence).toBe(0.95);
  });

  it('confidence disminuye con más facturas', async () => {
    const invoices = Array.from({ length: 5 }, (_, i) =>
      buildInvoice({ id: `i${i}`, totalAmount: 200, type: 'RECEIVED', contact })
    );
    const tx = buildBankTransaction({ amount: -1000 });

    mockPrisma.contact.findFirst.mockResolvedValue(contact);
    mockPrisma.invoice.findMany.mockResolvedValue(invoices);

    const result = await findGroupedMatch(tx, 'company_1');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThan(0.95);
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('sin IBAN → null', async () => {
    const tx = buildBankTransaction({ counterpartIban: null });
    const result = await findGroupedMatch(tx, 'company_1');
    expect(result).toBeNull();
    expect(mockPrisma.contact.findFirst).not.toHaveBeenCalled();
  });

  it('sin contacto con ese IBAN → null', async () => {
    const tx = buildBankTransaction();
    mockPrisma.contact.findFirst.mockResolvedValue(null);

    const result = await findGroupedMatch(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('solo 1 factura pendiente → null (necesita al menos 2)', async () => {
    const inv1 = buildInvoice({ totalAmount: 1000, type: 'RECEIVED', contact });
    const tx = buildBankTransaction({ amount: -1000 });

    mockPrisma.contact.findFirst.mockResolvedValue(contact);
    mockPrisma.invoice.findMany.mockResolvedValue([inv1]);

    const result = await findGroupedMatch(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('ninguna combinación suma el importe → null', async () => {
    const inv1 = buildInvoice({ id: 'i1', totalAmount: 600, type: 'RECEIVED', contact });
    const inv2 = buildInvoice({ id: 'i2', totalAmount: 500, type: 'RECEIVED', contact });
    const tx = buildBankTransaction({ amount: -1000 }); // 600 + 500 = 1100, not 1000

    mockPrisma.contact.findFirst.mockResolvedValue(contact);
    mockPrisma.invoice.findMany.mockResolvedValue([inv1, inv2]);

    const result = await findGroupedMatch(tx, 'company_1');
    expect(result).toBeNull();
  });

  it('matchReason incluye número de facturas', async () => {
    const inv1 = buildInvoice({ id: 'i1', totalAmount: 400, type: 'RECEIVED', contact });
    const inv2 = buildInvoice({ id: 'i2', totalAmount: 300, type: 'RECEIVED', contact });
    const inv3 = buildInvoice({ id: 'i3', totalAmount: 300, type: 'RECEIVED', contact });
    const tx = buildBankTransaction({ amount: -1000 });

    mockPrisma.contact.findFirst.mockResolvedValue(contact);
    mockPrisma.invoice.findMany.mockResolvedValue([inv1, inv2, inv3]);

    const result = await findGroupedMatch(tx, 'company_1');
    expect(result).not.toBeNull();
    expect(result!.matchReason).toContain('grouped_');
  });

  it('tx positiva (cobro) busca facturas ISSUED', async () => {
    const tx = buildBankTransaction({ amount: 1000 });
    mockPrisma.contact.findFirst.mockResolvedValue(contact);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await findGroupedMatch(tx, 'company_1');

    const invoiceCall = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(invoiceCall.where.type.in).toContain('ISSUED');
  });
});
