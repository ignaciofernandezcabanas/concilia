import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStorageProvider = vi.hoisted(() => ({
  name: "google_drive" as const,
  listFiles: vi.fn(),
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  createFolder: vi.fn(),
  ensureFolder: vi.fn(),
}));

const mockGetStorageProvider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({
  getStorageProvider: mockGetStorageProvider,
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

import { importInvoicesFromStorage } from "@/lib/invoices/import-from-storage";

describe("Import from Storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorageProvider.mockResolvedValue(mockStorageProvider);
    mockDb.invoice.findFirst.mockResolvedValue(null);
    mockDb.contact.upsert.mockResolvedValue({ id: "c1" });
    mockDb.invoice.create.mockResolvedValue({ id: "inv1" });
  });

  it("escanea carpeta e importa PDFs", async () => {
    mockStorageProvider.listFiles.mockResolvedValue([
      {
        id: "f1",
        name: "fra-001.pdf",
        mimeType: "application/pdf",
        size: 1024,
        createdAt: "",
        modifiedAt: "",
      },
      {
        id: "f2",
        name: "fra-002.pdf",
        mimeType: "application/pdf",
        size: 2048,
        createdAt: "",
        modifiedAt: "",
      },
      {
        id: "f3",
        name: "readme.txt",
        mimeType: "text/plain",
        size: 50,
        createdAt: "",
        modifiedAt: "",
      },
    ]);
    mockStorageProvider.downloadFile.mockResolvedValue(Buffer.from("pdf"));
    mockExtractInvoice.mockResolvedValue({
      number: "FRA",
      totalAmount: 1000,
      confidence: 0.85,
      type: "RECEIVED",
      currency: "EUR",
      lines: [],
    });

    const result = await importInvoicesFromStorage(mockDb as any, "company_1");

    expect(result.filesScanned).toBe(3);
    expect(result.pdfsFound).toBe(2);
    expect(result.invoicesImported).toBe(2);
  });

  it("ignora archivos no-PDF", async () => {
    mockStorageProvider.listFiles.mockResolvedValue([
      {
        id: "f1",
        name: "data.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 500,
        createdAt: "",
        modifiedAt: "",
      },
    ]);

    const result = await importInvoicesFromStorage(mockDb as any, "company_1");
    expect(result.pdfsFound).toBe(0);
    expect(mockStorageProvider.downloadFile).not.toHaveBeenCalled();
  });

  it("dedup: PDF ya importado → skipped", async () => {
    mockStorageProvider.listFiles.mockResolvedValue([
      {
        id: "f1",
        name: "fra.pdf",
        mimeType: "application/pdf",
        size: 1024,
        createdAt: "",
        modifiedAt: "",
      },
    ]);
    mockDb.invoice.findFirst.mockResolvedValue({ id: "existing" });

    const result = await importInvoicesFromStorage(mockDb as any, "company_1");
    expect(result.skipped).toBe(1);
    expect(mockStorageProvider.downloadFile).not.toHaveBeenCalled();
  });

  it("OCR confidence < 0.50 → error", async () => {
    mockStorageProvider.listFiles.mockResolvedValue([
      {
        id: "f1",
        name: "borroso.pdf",
        mimeType: "application/pdf",
        size: 1024,
        createdAt: "",
        modifiedAt: "",
      },
    ]);
    mockStorageProvider.downloadFile.mockResolvedValue(Buffer.from("pdf"));
    mockExtractInvoice.mockResolvedValue({ totalAmount: null, confidence: 0.3, lines: [] });

    const result = await importInvoicesFromStorage(mockDb as any, "company_1");
    expect(result.errors).toHaveLength(1);
    expect(result.invoicesImported).toBe(0);
  });

  it("maxFiles: 2 con 5 PDFs → hasMore=true", async () => {
    mockStorageProvider.listFiles.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `f${i}`,
        name: `f${i}.pdf`,
        mimeType: "application/pdf",
        size: 100,
        createdAt: "",
        modifiedAt: "",
      }))
    );
    mockStorageProvider.downloadFile.mockResolvedValue(Buffer.from("pdf"));
    mockExtractInvoice.mockResolvedValue({
      number: "X",
      totalAmount: 100,
      confidence: 0.8,
      type: "RECEIVED",
      currency: "EUR",
      lines: [],
    });

    const result = await importInvoicesFromStorage(mockDb as any, "company_1", { maxFiles: 2 });
    expect(result.invoicesImported).toBe(2);
    expect(result.hasMore).toBe(true);
  });

  it("sin storage provider → return vacío", async () => {
    mockGetStorageProvider.mockResolvedValueOnce(null);

    const result = await importInvoicesFromStorage(mockDb as any, "company_1");
    expect(result.filesScanned).toBe(0);
  });
});
