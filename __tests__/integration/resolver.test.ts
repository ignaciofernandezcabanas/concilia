import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildBankTransaction,
  buildInvoice,
  buildReconciliation,
  buildContact,
} from "../helpers/factories";

// ── Mock prisma ──
const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  reconciliation: {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  bankTransaction: {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  invoice: {
    findFirstOrThrow: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  account: {
    findFirstOrThrow: vi.fn(),
  },
  bankTransactionClassification: {
    create: vi.fn(),
  },
  matchingRule: {
    update: vi.fn(),
    create: vi.fn(),
  },
  duplicateGroup: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  notification: {
    createMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

// Mock decision tracker
const mockTrackDecision = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reconciliation/decision-tracker", () => ({
  trackControllerDecision: mockTrackDecision,
}));

// Mock invoice-payments (called inside the transaction)
const mockUpdatePayment = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reconciliation/invoice-payments", () => ({
  updateInvoicePaymentStatus: mockUpdatePayment,
}));

// Mock calibrator
const mockCalibrate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/confidence-calibrator", () => ({
  calibrateFromDecision: mockCalibrate,
}));

import { resolveItem } from "@/lib/reconciliation/resolver";

describe("resolveItem — Unified Resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make $transaction execute the callback with mockPrisma as tx
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
    );
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.matchingRule.update.mockResolvedValue({});
    mockPrisma.matchingRule.create.mockResolvedValue({});
    mockPrisma.notification.createMany.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);
    // Pre-transaction lookups for calibration
    mockPrisma.reconciliation.findFirst.mockResolvedValue(null);
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(null);
    mockTrackDecision.mockResolvedValue(undefined);
    mockCalibrate.mockResolvedValue(undefined);
    mockUpdatePayment.mockResolvedValue({
      newStatus: "PAID",
      newAmountPaid: 1000,
      newAmountPending: 0,
    });
  });

  // ── APPROVE ──
  describe("approve", () => {
    it("actualiza reconciliation a APPROVED y tx a RECONCILED", async () => {
      const reco = buildReconciliation({ bankTransactionId: "tx_1", invoiceId: null });
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...reco,
        bankTransaction: bankTx,
        invoice: null,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      const result = await resolveItem(
        { action: "approve", reconciliationId: "reco_1" },
        "user_1",
        "company_1"
      );
      expect(result.success).toBe(true);
      expect(mockPrisma.reconciliation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) })
      );
      expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "RECONCILED" }) })
      );
    });

    it("llama a updateInvoicePaymentStatus si hay invoice", async () => {
      const invoice = buildInvoice();
      const bankTx = buildBankTransaction({ amount: -1000 });
      const reco = buildReconciliation({ bankAmount: 1000 });
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...reco,
        bankTransaction: bankTx,
        invoice,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem({ action: "approve", reconciliationId: "reco_1" }, "user_1", "company_1");
      expect(mockUpdatePayment).toHaveBeenCalledWith(invoice.id, 1000, mockPrisma);
    });

    it("sin invoice → no rompe", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...buildReconciliation(),
        bankTransaction: bankTx,
        invoice: null,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      const result = await resolveItem(
        { action: "approve", reconciliationId: "reco_1" },
        "user_1",
        "company_1"
      );
      expect(result.success).toBe(true);
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("crea audit log", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...buildReconciliation(),
        bankTransaction: bankTx,
        invoice: null,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem({ action: "approve", reconciliationId: "reco_1" }, "user_1", "company_1");
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "reconciliation.approve" }),
        })
      );
    });
  });

  // ── REJECT ──
  describe("reject", () => {
    it("reconciliation a REJECTED, tx vuelve a PENDING", async () => {
      const reco = buildReconciliation({ bankTransactionId: "tx_1", matchReason: "exact" });
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...reco,
        bankTransaction: bankTx,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      const result = await resolveItem(
        { action: "reject", reconciliationId: "reco_1", reason: "Incorrecto" },
        "user_1",
        "company_1"
      );
      expect(result.success).toBe(true);
      expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) })
      );
    });

    it('desactiva regla si matchReason empieza por "rule:"', async () => {
      const reco = buildReconciliation({ matchReason: "rule:rule_1:test" });
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...reco,
        bankTransaction: bankTx,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem(
        { action: "reject", reconciliationId: "reco_1", reason: "Bad rule" },
        "user_1",
        "company_1"
      );
      expect(mockPrisma.matchingRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "rule_1" }, data: { isActive: false } })
      );
    });
  });

  // ── INVESTIGATE ──
  describe("investigate", () => {
    it("tx a INVESTIGATING, notifica admins", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...buildReconciliation(),
        bankTransaction: bankTx,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([{ id: "admin_1" }]);

      await resolveItem(
        { action: "investigate", reconciliationId: "reco_1", note: "Revisar" },
        "user_1",
        "company_1"
      );
      expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "INVESTIGATING" }) })
      );
      expect(mockPrisma.notification.createMany).toHaveBeenCalled();
    });
  });

  // ── MANUAL MATCH ──
  describe("manual_match", () => {
    it("crea reconciliation MANUAL con confidence 1.0 y actualiza invoice", async () => {
      const bankTx = buildBankTransaction({ amount: -1000 });
      const invoice = buildInvoice({ totalAmount: 1000 });
      mockPrisma.bankTransaction.findFirstOrThrow.mockResolvedValue(bankTx);
      mockPrisma.invoice.findFirstOrThrow.mockResolvedValue(invoice);
      mockPrisma.reconciliation.create.mockResolvedValue({ id: "reco_new" });
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      const result = await resolveItem(
        {
          action: "manual_match",
          bankTransactionId: "tx_1",
          invoiceId: "invoice_1",
        },
        "user_1",
        "company_1"
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.reconciliation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: "MANUAL", confidenceScore: 1.0 }),
        })
      );
      expect(mockUpdatePayment).toHaveBeenCalledWith("invoice_1", 1000, mockPrisma);
    });

    it("calcula difference correctamente", async () => {
      const bankTx = buildBankTransaction({ amount: -985 });
      const invoice = buildInvoice({ totalAmount: 1000 });
      mockPrisma.bankTransaction.findFirstOrThrow.mockResolvedValue(bankTx);
      mockPrisma.invoice.findFirstOrThrow.mockResolvedValue(invoice);
      mockPrisma.reconciliation.create.mockResolvedValue({ id: "reco_new" });
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem(
        {
          action: "manual_match",
          bankTransactionId: "tx_1",
          invoiceId: "invoice_1",
        },
        "user_1",
        "company_1"
      );

      expect(mockPrisma.reconciliation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ difference: 15 }) })
      );
    });
  });

  // ── CLASSIFY ──
  describe("classify", () => {
    it("crea classification y tx a CLASSIFIED", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.bankTransaction.findFirstOrThrow.mockResolvedValue(bankTx);
      mockPrisma.account.findFirstOrThrow.mockResolvedValue({
        id: "acc_1",
        code: "629",
        name: "Otros servicios",
        cashflowType: "OPERATING",
      });
      mockPrisma.bankTransactionClassification.create.mockResolvedValue({ id: "class_1" });
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      const result = await resolveItem(
        {
          action: "classify",
          bankTransactionId: "tx_1",
          accountCode: "629",
          cashflowType: "OPERATING",
        },
        "user_1",
        "company_1"
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.bankTransactionClassification.create).toHaveBeenCalled();
      expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "CLASSIFIED" }) })
      );
    });

    it("si createRule=true → crea MatchingRule", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.bankTransaction.findFirstOrThrow.mockResolvedValue(bankTx);
      mockPrisma.account.findFirstOrThrow.mockResolvedValue({
        id: "acc_1",
        code: "629",
        name: "Test",
      });
      mockPrisma.bankTransactionClassification.create.mockResolvedValue({ id: "class_1" });
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem(
        {
          action: "classify",
          bankTransactionId: "tx_1",
          accountCode: "629",
          createRule: true,
        },
        "user_1",
        "company_1"
      );

      expect(mockPrisma.matchingRule.create).toHaveBeenCalled();
    });
  });

  // ── MARK INTERNAL ──
  describe("mark_internal", () => {
    it("tx a INTERNAL, detectedType INTERNAL_TRANSFER", async () => {
      mockPrisma.bankTransaction.findFirstOrThrow.mockResolvedValue(buildBankTransaction());
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      const result = await resolveItem(
        { action: "mark_internal", bankTransactionId: "tx_1" },
        "user_1",
        "company_1"
      );
      expect(result.success).toBe(true);
      expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "INTERNAL", detectedType: "INTERNAL_TRANSFER" }),
        })
      );
    });
  });

  // ── MARK DUPLICATE ──
  describe("mark_duplicate", () => {
    it("tx a DUPLICATE, duplicateGroup actualizado si existe", async () => {
      const bankTx = buildBankTransaction({ duplicateGroupId: "group_1" });
      mockPrisma.bankTransaction.findFirstOrThrow.mockResolvedValue(bankTx);
      mockPrisma.bankTransaction.update.mockResolvedValue({});
      mockPrisma.duplicateGroup.update.mockResolvedValue({});

      await resolveItem(
        { action: "mark_duplicate", bankTransactionId: "tx_1" },
        "user_1",
        "company_1"
      );
      expect(mockPrisma.duplicateGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "group_1" },
          data: expect.objectContaining({ status: "DUPLICATE" }),
        })
      );
    });
  });

  // ── MARK LEGITIMATE ──
  describe("mark_legitimate", () => {
    it("DuplicateGroup a LEGITIMATE, txs vuelven a PENDING", async () => {
      mockPrisma.duplicateGroup.findUniqueOrThrow.mockResolvedValue({
        id: "group_1",
        transactions: [
          { id: "tx_1", companyId: "company_1" },
          { id: "tx_2", companyId: "company_1" },
        ],
      });
      mockPrisma.duplicateGroup.update.mockResolvedValue({});
      mockPrisma.bankTransaction.updateMany.mockResolvedValue({});

      const result = await resolveItem(
        { action: "mark_legitimate", duplicateGroupId: "group_1" },
        "user_1",
        "company_1"
      );
      expect(result.success).toBe(true);
      expect(mockPrisma.bankTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) })
      );
    });
  });

  // ── IGNORE ──
  describe("ignore", () => {
    it("tx a IGNORED, guarda note", async () => {
      mockPrisma.bankTransaction.findFirstOrThrow.mockResolvedValue(buildBankTransaction());
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem(
        { action: "ignore", bankTransactionId: "tx_1", reason: "No relevante" },
        "user_1",
        "company_1"
      );
      expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "IGNORED", note: "No relevante" }),
        })
      );
    });
  });

  // ── SPLIT FINANCIAL ──
  describe("split_financial", () => {
    it("reconciliation APPROVED con resolution principal/interest", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...buildReconciliation(),
        bankTransaction: bankTx,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      const result = await resolveItem(
        {
          action: "split_financial",
          reconciliationId: "reco_1",
          principalAmount: 850,
          interestAmount: 150,
        },
        "user_1",
        "company_1"
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.reconciliation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "APPROVED",
            resolution: expect.stringContaining("principal=850"),
          }),
        })
      );
    });
  });

  // ── GUARDS ──
  describe("guards", () => {
    it("reconciliation de otra company → error", async () => {
      mockPrisma.reconciliation.findFirstOrThrow.mockRejectedValue(new Error("Not found"));

      await expect(
        resolveItem({ action: "approve", reconciliationId: "reco_foreign" }, "user_1", "company_1")
      ).rejects.toThrow();
    });

    it("action desconocida → error", async () => {
      await expect(
        resolveItem({ action: "unknown_action" as never }, "user_1", "company_1")
      ).rejects.toThrow(/Unknown action/);
    });
  });

  // ── TRANSACTION SAFETY ──
  describe("transaction safety", () => {
    it("prisma.$transaction se llama", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...buildReconciliation(),
        bankTransaction: bankTx,
        invoice: null,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem({ action: "approve", reconciliationId: "reco_1" }, "user_1", "company_1");
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── DECISION TRACKING ──
  describe("decision tracking", () => {
    it("trackControllerDecision se llama post-transaction", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...buildReconciliation(),
        bankTransaction: bankTx,
        invoice: null,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});

      await resolveItem({ action: "approve", reconciliationId: "reco_1" }, "user_1", "company_1");
      expect(mockTrackDecision).toHaveBeenCalledWith(
        expect.anything(), // db
        expect.objectContaining({ controllerAction: "approve", companyId: "company_1" })
      );
    });

    it("si trackControllerDecision falla, no rompe el resolve", async () => {
      const bankTx = buildBankTransaction();
      mockPrisma.reconciliation.findFirstOrThrow.mockResolvedValue({
        ...buildReconciliation(),
        bankTransaction: bankTx,
        invoice: null,
      });
      mockPrisma.reconciliation.update.mockResolvedValue({});
      mockPrisma.bankTransaction.update.mockResolvedValue({});
      mockTrackDecision.mockRejectedValue(new Error("Track failed"));

      const result = await resolveItem(
        { action: "approve", reconciliationId: "reco_1" },
        "user_1",
        "company_1"
      );
      expect(result.success).toBe(true);
    });
  });
});
