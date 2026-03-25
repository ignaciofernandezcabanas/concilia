"use client";

import { useEffect } from "react";
import { Check, X, AlertTriangle } from "lucide-react";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  message: string;
  type: "success" | "error" | "warning";
  onDismiss: () => void;
  action?: ToastAction;
}

export default function Toast({ message, type, onDismiss, action }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, action ? 10000 : 4000);
    return () => clearTimeout(timer);
  }, [onDismiss, action]);

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
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border text-[13px] font-medium shadow-lg ${styles[type]}`}
    >
      {icons[type]}
      {message}
      {action && (
        <>
          <span className="opacity-40">·</span>
          <button
            onClick={() => {
              action.onClick();
              onDismiss();
            }}
            className="underline font-semibold hover:opacity-80 transition-opacity"
          >
            {action.label}
          </button>
        </>
      )}
    </div>
  );
}
