import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEmailProvider = vi.hoisted(() => ({
  name: "gmail" as const,
  searchMessages: vi.fn(),
  getMessage: vi.fn(),
  downloadAttachment: vi.fn(),
  markAsRead: vi.fn(),
}));

const mockGetEmailProvider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({
  getEmailProvider: mockGetEmailProvider,
}));

const mockExtractInvoice = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoices/pdf-extractor", () => ({
  extractInvoiceFromPdf: mockExtractInvoice,
}));

const mockDb = {
  invoice: { findFirst: vi.fn(), create: vi.fn() },
  contact: { upsert: vi.fn() },
  integration: { findFirst: vi.fn() },
};

import { importInvoicesFromMailbox } from "@/lib/invoices/import-from-mailbox";

describe("Import from Mailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEmailProvider.mockResolvedValue(mockEmailProvider);
    mockDb.invoice.findFirst.mockResolvedValue(null);
    mockDb.contact.upsert.mockResolvedValue({ id: "c1" });
    mockDb.invoice.create.mockResolvedValue({ id: "inv1" });
    mockEmailProvider.markAsRead.mockResolvedValue(undefined);
  });

  it("lee emails no leídos y importa PDFs adjuntos", async () => {
    mockEmailProvider.searchMessages.mockResolvedValue([
      {
        id: "msg_1",
        from: "proveedor@otro.es",
        subject: "Factura Marzo 2026",
        date: "2026-03-10",
        snippet: "",
        hasAttachments: true,
        attachments: [
          { id: "att_1", fileName: "FRA-2026-045.pdf", mimeType: "application/pdf", size: 50000 },
        ],
      },
    ]);
    mockEmailProvider.downloadAttachment.mockResolvedValue(Buffer.from("pdf-content"));
    mockExtractInvoice.mockResolvedValue({
      number: "FRA-2026-045",
      totalAmount: 1210,
      netAmount: 1000,
      vatAmount: 210,
      vatRate: 0.21,
      supplierName: "Proveedor SL",
      supplierCif: "B12345678",
      confidence: 0.88,
      issueDate: "2026-03-01",
      type: "RECEIVED",
      currency: "EUR",
      lines: [],
    });

    const result = await importInvoicesFromMailbox(mockDb as any, "company_1");

    expect(result.emailsRead).toBe(1);
    expect(result.attachmentsFound).toBe(1);
    expect(result.invoicesImported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockEmailProvider.markAsRead).toHaveBeenCalledWith("msg_1");
  });

  it("dedup: adjunto ya importado → skipped, no descarga", async () => {
    mockEmailProvider.searchMessages.mockResolvedValue([
      {
        id: "msg_1",
        from: "x@y.es",
        subject: "F",
        date: "2026-03-01",
        snippet: "",
        hasAttachments: true,
        attachments: [{ id: "att_1", fileName: "f.pdf", mimeType: "application/pdf", size: 1000 }],
      },
    ]);
    mockDb.invoice.findFirst.mockResolvedValue({
      id: "existing",
      externalId: "mailbox:msg_1:att_1",
    });

    const result = await importInvoicesFromMailbox(mockDb as any, "company_1");

    expect(result.skipped).toBe(1);
    expect(result.invoicesImported).toBe(0);
    expect(mockEmailProvider.downloadAttachment).not.toHaveBeenCalled();
    expect(mockEmailProvider.markAsRead).toHaveBeenCalledWith("msg_1");
  });

  it("ignora adjuntos que no son PDF", async () => {
    mockEmailProvider.searchMessages.mockResolvedValue([
      {
        id: "msg_1",
        from: "x@y.es",
        subject: "Docs",
        date: "2026-03-01",
        snippet: "",
        hasAttachments: true,
        attachments: [
          { id: "att_1", fileName: "foto.jpg", mimeType: "image/jpeg", size: 500 },
          {
            id: "att_2",
            fileName: "hoja.xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size: 800,
          },
        ],
      },
    ]);

    const result = await importInvoicesFromMailbox(mockDb as any, "company_1");

    expect(result.attachmentsFound).toBe(0);
    expect(result.invoicesImported).toBe(0);
    expect(mockEmailProvider.downloadAttachment).not.toHaveBeenCalled();
  });

  it("OCR con confidence < 0.50 → error, no crea factura", async () => {
    mockEmailProvider.searchMessages.mockResolvedValue([
      {
        id: "msg_1",
        from: "x@y.es",
        subject: "F",
        date: "2026-03-01",
        snippet: "",
        hasAttachments: true,
        attachments: [
          { id: "att_1", fileName: "borroso.pdf", mimeType: "application/pdf", size: 1000 },
        ],
      },
    ]);
    mockEmailProvider.downloadAttachment.mockResolvedValue(Buffer.from("bad-pdf"));
    mockExtractInvoice.mockResolvedValue({ totalAmount: null, confidence: 0.25, lines: [] });

    const result = await importInvoicesFromMailbox(mockDb as any, "company_1");

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("confidence");
    expect(result.invoicesImported).toBe(0);
    expect(mockDb.invoice.create).not.toHaveBeenCalled();
  });

  it("email con múltiples PDFs → importa todos", async () => {
    mockEmailProvider.searchMessages.mockResolvedValue([
      {
        id: "msg_1",
        from: "gestor@asesor.es",
        subject: "Facturas del mes",
        date: "2026-03-01",
        snippet: "",
        hasAttachments: true,
        attachments: [
          { id: "att_1", fileName: "fra-001.pdf", mimeType: "application/pdf", size: 1000 },
          { id: "att_2", fileName: "fra-002.pdf", mimeType: "application/pdf", size: 2000 },
          { id: "att_3", fileName: "fra-003.pdf", mimeType: "application/pdf", size: 1500 },
        ],
      },
    ]);
    mockEmailProvider.downloadAttachment.mockResolvedValue(Buffer.from("pdf"));
    mockExtractInvoice.mockResolvedValue({
      number: "FRA-X",
      totalAmount: 500,
      confidence: 0.82,
      type: "RECEIVED",
      currency: "EUR",
      lines: [],
    });

    const result = await importInvoicesFromMailbox(mockDb as any, "company_1");

    expect(result.attachmentsFound).toBe(3);
    expect(result.invoicesImported).toBe(3);
    expect(mockEmailProvider.markAsRead).toHaveBeenCalledTimes(1);
  });

  it("marca email como leído SOLO después de procesar todos los adjuntos", async () => {
    const callOrder: string[] = [];
    mockEmailProvider.searchMessages.mockResolvedValue([
      {
        id: "msg_1",
        from: "x@y.es",
        subject: "F",
        date: "2026-03-01",
        snippet: "",
        hasAttachments: true,
        attachments: [{ id: "att_1", fileName: "f.pdf", mimeType: "application/pdf", size: 100 }],
      },
    ]);
    mockEmailProvider.downloadAttachment.mockImplementation(async () => {
      callOrder.push("download");
      return Buffer.from("pdf");
    });
    mockExtractInvoice.mockImplementation(async () => {
      callOrder.push("extract");
      return {
        number: "X",
        totalAmount: 100,
        confidence: 0.8,
        type: "RECEIVED",
        currency: "EUR",
        lines: [],
      };
    });
    mockDb.invoice.create.mockImplementation(async () => {
      callOrder.push("create");
      return { id: "inv" };
    });
    mockEmailProvider.markAsRead.mockImplementation(async () => {
      callOrder.push("markAsRead");
    });

    await importInvoicesFromMailbox(mockDb as any, "company_1");

    const markIdx = callOrder.indexOf("markAsRead");
    const createIdx = callOrder.indexOf("create");
    expect(markIdx).toBeGreaterThan(createIdx);
  });

  it("sin email provider configurado → return vacío sin errores", async () => {
    mockGetEmailProvider.mockResolvedValueOnce(null);

    const result = await importInvoicesFromMailbox(mockDb as any, "company_1");

    expect(result.emailsRead).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("fallo en markAsRead no rompe el import", async () => {
    mockEmailProvider.searchMessages.mockResolvedValue([
      {
        id: "msg_1",
        from: "x@y.es",
        subject: "F",
        date: "2026-03-01",
        snippet: "",
        hasAttachments: true,
        attachments: [{ id: "att_1", fileName: "f.pdf", mimeType: "application/pdf", size: 100 }],
      },
    ]);
    mockEmailProvider.downloadAttachment.mockResolvedValue(Buffer.from("pdf"));
    mockExtractInvoice.mockResolvedValue({
      number: "X",
      totalAmount: 100,
      confidence: 0.8,
      type: "RECEIVED",
      currency: "EUR",
      lines: [],
    });
    mockEmailProvider.markAsRead.mockRejectedValue(new Error("network error"));

    const result = await importInvoicesFromMailbox(mockDb as any, "company_1");

    expect(result.invoicesImported).toBe(1);
  });
});
