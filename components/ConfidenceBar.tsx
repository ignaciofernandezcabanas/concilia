"use client";

export default function ConfidenceBar({
  score,
  showLabel = true,
}: {
  score: number;
  showLabel?: boolean;
}) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? "bg-green" : pct >= 70 ? "bg-amber" : "bg-red";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-subtle rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span
          className={`text-[10px] font-medium ${pct >= 90 ? "text-green-text" : pct >= 70 ? "text-amber" : "text-red-text"}`}
        >
          {pct}%
        </span>
      )}
    </div>
  );
}
