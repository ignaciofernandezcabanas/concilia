import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateInvoicePaymentStatus } from '@/lib/reconciliation/invoice-payments';

function createMockTx(invoice: { amountPaid: number; totalAmount: number }) {
  return {
    invoice: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(invoice),
      update: vi.fn().mockResolvedValue({}),
    },
  } as never;
}

describe('updateInvoicePaymentStatus', () => {
  it('marca como PAID cuando el pago cubre el total', async () => {
    const tx = createMockTx({ amountPaid: 0, totalAmount: 1000 });
    const result = await updateInvoicePaymentStatus('inv_1', 1000, tx);
    expect(result.newStatus).toBe('PAID');
    expect(result.newAmountPending).toBe(0);
    expect(result.newAmountPaid).toBe(1000);
  });

  it('marca como PARTIAL cuando el pago no cubre el total', async () => {
    const tx = createMockTx({ amountPaid: 0, totalAmount: 1000 });
    const result = await updateInvoicePaymentStatus('inv_1', 500, tx);
    expect(result.newStatus).toBe('PARTIAL');
    expect(result.newAmountPaid).toBe(500);
    expect(result.newAmountPending).toBe(500);
  });

  it('pagos acumulados que cubren total → PAID', async () => {
    const tx = createMockTx({ amountPaid: 600, totalAmount: 1000 });
    const result = await updateInvoicePaymentStatus('inv_1', 400, tx);
    expect(result.newStatus).toBe('PAID');
    expect(result.newAmountPaid).toBe(1000);
    expect(result.newAmountPending).toBe(0);
  });

  it('tolerancia de 0.01€: pago de 99.99 sobre factura de 100.00 → PAID', async () => {
    const tx = createMockTx({ amountPaid: 0, totalAmount: 100 });
    const result = await updateInvoicePaymentStatus('inv_1', 99.99, tx);
    expect(result.newStatus).toBe('PAID');
  });

  it('queda 0.50€ pendiente → PARTIAL (más que tolerancia)', async () => {
    const tx = createMockTx({ amountPaid: 0, totalAmount: 100 });
    const result = await updateInvoicePaymentStatus('inv_1', 99.50, tx);
    expect(result.newStatus).toBe('PARTIAL');
    expect(result.newAmountPending).toBe(0.50);
  });

  it('redondeo consistente sin floating point errors', async () => {
    const tx = createMockTx({ amountPaid: 33.37, totalAmount: 100.10 });
    const result = await updateInvoicePaymentStatus('inv_1', 33.37, tx);
    expect(result.newAmountPaid).toBe(66.74);
    expect(result.newAmountPending).toBe(33.36);
    expect(result.newStatus).toBe('PARTIAL');
  });

  it('reversión: pago negativo sobre factura pagada → PENDING', async () => {
    const tx = createMockTx({ amountPaid: 1000, totalAmount: 1000 });
    const result = await updateInvoicePaymentStatus('inv_1', -1000, tx);
    expect(result.newStatus).toBe('PENDING');
    expect(result.newAmountPaid).toBe(0);
  });

  it('amountPending nunca negativo (pago mayor que total)', async () => {
    const tx = createMockTx({ amountPaid: 0, totalAmount: 100 });
    const result = await updateInvoicePaymentStatus('inv_1', 150, tx);
    expect(result.newAmountPending).toBe(0);
    expect(result.newAmountPending).toBeGreaterThanOrEqual(0);
  });

  it('llama a invoice.update con los datos correctos', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      invoice: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ amountPaid: 0, totalAmount: 500 }),
        update: mockUpdate,
      },
    } as never;

    await updateInvoicePaymentStatus('inv_1', 500, tx);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { amountPaid: 500, amountPending: 0, status: 'PAID' },
    });
  });
});
