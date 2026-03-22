"use client";

export default function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <div className="w-6 h-6 border-2 border-subtle border-t-accent rounded-full animate-spin" />
    </div>
  );
}
