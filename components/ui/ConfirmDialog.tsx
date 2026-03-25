"use client";

import { useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "destructive",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    },
    [onCancel, loading]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const confirmBtnClass =
    variant === "destructive"
      ? "bg-red text-white hover:bg-red/90"
      : "bg-accent text-white hover:bg-accent/90";

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="bg-white rounded-lg border border-subtle w-full max-w-[420px] shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
          <p className="text-[13px] text-text-secondary mt-2 leading-relaxed">{description}</p>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-[13px] font-medium text-text-secondary px-4 py-2 rounded-md hover:bg-hover transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`text-[13px] font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2 ${confirmBtnClass}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
