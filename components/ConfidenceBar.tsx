"use client";

export default function ConfidenceBar({
  score,
  showLabel = false,
}: {
  score: number;
  showLabel?: boolean;
}) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? "bg-green" : pct >= 70 ? "bg-amber" : "bg-red";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-subtle rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-[10px] text-text-tertiary">{pct}%</span>}
    </div>
  );
}
