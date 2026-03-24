"use client";

import { X } from "lucide-react";

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
        <iframe
          src={`/api/invoices/${invoiceId}/pdf`}
          className="w-full flex-1 rounded-b-xl"
          title={`Factura ${invoiceNumber}`}
        />
      </div>
    </div>
  );
}
