"use client";

import { useEffect } from "react";
import { Check, X, AlertTriangle } from "lucide-react";

interface ToastProps {
  message: string;
  type: "success" | "error" | "warning";
  onDismiss: () => void;
}

export default function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const styles = {
    success: "bg-green-light border-green text-green-text",
    error: "bg-red-light border-red text-red-text",
    warning: "bg-amber-light border-amber text-amber-text",
  };

  const icons = {
    success: <Check size={14} />,
    error: <X size={14} />,
    warning: <AlertTriangle size={14} />,
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border text-[13px] font-medium shadow-lg ${styles[type]}`}>
      {icons[type]}
      {message}
    </div>
  );
}
