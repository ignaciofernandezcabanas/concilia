"use client";

import { useState, useEffect } from "react";
import { X, FileText } from "lucide-react";

interface InvoiceDetail {
  id: string;
  number: string;
  type: string;
  issueDate: string;
  dueDate?: string | null;
  totalAmount: number;
  netAmount?: number | null;
  vatAmount?: number | null;
  currency: string;
  description?: string | null;
  status: string;
  amountPaid: number;
  amountPending?: number | null;
  pdfUrl?: string | null;
  contact?: { name: string; cif?: string | null } | null;
  lines?: Array<{
    description?: string | null;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    vatRate?: number | null;
  }>;
}

interface InvoicePdfModalProps {
  invoiceId: string;
  invoiceNumber: string;
  onClose: () => void;
}

export default function InvoicePdfModal({
  invoiceId,
  invoiceNumber,
  onClose,
}: InvoicePdfModalProps) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPdf, setHasPdf] = useState<boolean | null>(null);

  useEffect(() => {
    // Fetch invoice detail to check if PDF exists
    fetch(`/api/invoices/${invoiceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setInvoice(data);
        setHasPdf(!!data?.pdfUrl);
        setLoading(false);
      })
      .catch(() => {
        setHasPdf(false);
        setLoading(false);
      });
  }, [invoiceId]);

  const fmt = (n: number) =>
    n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-ES");

  const typeLabel: Record<string, string> = {
    ISSUED: "Emitida",
    RECEIVED: "Recibida",
    CREDIT_ISSUED: "Abono emitido",
    CREDIT_RECEIVED: "Abono recibido",
  };

  const statusLabel: Record<string, string> = {
    PENDING: "Pendiente",
    PARTIAL: "Parcial",
    PAID: "Pagada",
    OVERDUE: "Vencida",
    CANCELLED: "Cancelada",
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Factura {invoiceNumber}</h3>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
            Cargando...
          </div>
        )}

        {/* PDF viewer — when PDF exists */}
        {!loading && hasPdf && (
          <iframe
            src={`/api/invoices/${invoiceId}/pdf`}
            className="w-full flex-1 rounded-b-xl"
            title={`Factura ${invoiceNumber}`}
          />
        )}

        {/* Invoice detail view — when no PDF */}
        {!loading && !hasPdf && invoice && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <FileText size={20} className="text-accent" />
                    <span className="text-xl font-semibold font-mono">{invoice.number}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      invoice.type.includes("RECEIVED")
                        ? "bg-red-50 text-red-600"
                        : "bg-green-50 text-green-600"
                    }`}
                  >
                    {typeLabel[invoice.type] ?? invoice.type}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ml-2 ${
                      invoice.status === "PAID"
                        ? "bg-green-50 text-green-600"
                        : invoice.status === "OVERDUE"
                          ? "bg-red-50 text-red-600"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {statusLabel[invoice.status] ?? invoice.status}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold font-mono">
                    {fmt(invoice.totalAmount)} {invoice.currency}
                  </p>
                  {invoice.amountPending != null && invoice.amountPending > 0 && (
                    <p className="text-xs text-red-600">
                      Pendiente: {fmt(invoice.amountPending)} {invoice.currency}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact + dates */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
                {invoice.contact && (
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase mb-1">
                      {invoice.type.includes("RECEIVED") ? "Proveedor" : "Cliente"}
                    </p>
                    <p className="text-sm font-medium">{invoice.contact.name}</p>
                    {invoice.contact.cif && (
                      <p className="text-xs text-text-secondary font-mono">{invoice.contact.cif}</p>
                    )}
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase mb-1">Fechas</p>
                  <p className="text-sm">
                    Emisión: <span className="font-medium">{fmtDate(invoice.issueDate)}</span>
                  </p>
                  {invoice.dueDate && (
                    <p className="text-sm">
                      Vencimiento: <span className="font-medium">{fmtDate(invoice.dueDate)}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Amounts breakdown */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-[10px] text-text-tertiary uppercase mb-2">Desglose</p>
                <div className="space-y-1 text-sm">
                  {invoice.netAmount != null && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Base imponible</span>
                      <span className="font-mono">
                        {fmt(invoice.netAmount)} {invoice.currency}
                      </span>
                    </div>
                  )}
                  {invoice.vatAmount != null && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">IVA</span>
                      <span className="font-mono">
                        {fmt(invoice.vatAmount)} {invoice.currency}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                    <span>Total</span>
                    <span className="font-mono">
                      {fmt(invoice.totalAmount)} {invoice.currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lines */}
              {invoice.lines && invoice.lines.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase mb-2">Líneas</p>
                  <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2">Descripción</th>
                        <th className="text-right px-3 py-2">Cant.</th>
                        <th className="text-right px-3 py-2">P. Unit.</th>
                        <th className="text-right px-3 py-2">IVA</th>
                        <th className="text-right px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lines.map((line, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1.5">{line.description ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{line.quantity}</td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {fmt(line.unitPrice)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {line.vatRate != null ? `${(line.vatRate * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {fmt(line.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Description */}
              {invoice.description && (
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase mb-1">Descripción</p>
                  <p className="text-sm text-text-secondary">{invoice.description}</p>
                </div>
              )}

              <p className="text-[10px] text-text-tertiary text-center pt-4">
                No hay PDF disponible para esta factura. Se muestra la información del sistema.
              </p>
            </div>
          </div>
        )}

        {/* No data */}
        {!loading && !hasPdf && !invoice && (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
            No se encontró información para esta factura.
          </div>
        )}
      </div>
    </div>
  );
}
