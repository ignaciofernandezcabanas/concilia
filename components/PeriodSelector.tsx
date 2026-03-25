"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatPeriodLabel } from "@/lib/format";

export type PeriodType = "month" | "quarter" | "year";

interface Props {
  periodType: PeriodType;
  setPeriodType: (pt: PeriodType) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
}

export default function PeriodSelector({
  periodType,
  setPeriodType,
  label,
  onPrev,
  onNext,
}: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-2 bg-white border border-subtle rounded-md px-3 h-8">
        <button onClick={onPrev}>
          <ChevronLeft size={14} className="text-text-secondary" />
        </button>
        <span className="text-xs font-medium text-text-primary capitalize w-28 text-center">
          {label}
        </span>
        <button onClick={onNext}>
          <ChevronRight size={14} className="text-text-secondary" />
        </button>
      </div>
      <div className="flex items-center h-8 rounded-md overflow-hidden border border-subtle">
        {(["month", "quarter", "year"] as PeriodType[]).map((pt, i) => (
          <button
            key={pt}
            onClick={() => setPeriodType(pt)}
            className={`px-3 h-full text-xs font-medium ${
              periodType === pt
                ? "bg-accent text-white"
                : "bg-white text-text-secondary hover:bg-hover"
            } ${i > 0 ? "border-l border-subtle" : ""}`}
          >
            {{ month: "Mensual", quarter: "Trimestral", year: "Anual" }[pt]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Returns months array for the period, plus from/to/label */
export function usePeriodData(periodType: PeriodType, offset: number) {
  const now = new Date();

  if (periodType === "month") {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      from: fmt(d),
      to: fmt(end),
      label: formatPeriodLabel(d),
      months: [
        { key: fmt(d).slice(0, 7), label: d.toLocaleDateString("es-ES", { month: "short" }) },
      ],
    };
  }

  if (periodType === "quarter") {
    const q = Math.floor(now.getMonth() / 3) + offset;
    const y = now.getFullYear() + Math.floor(q / 4);
    const qIdx = ((q % 4) + 4) % 4;
    const from = new Date(y, qIdx * 3, 1);
    const to = new Date(y, qIdx * 3 + 3, 0);
    const months = [0, 1, 2].map((i) => {
      const d = new Date(y, qIdx * 3 + i, 1);
      return { key: fmt(d).slice(0, 7), label: d.toLocaleDateString("es-ES", { month: "short" }) };
    });
    return { from: fmt(from), to: fmt(to), label: `T${qIdx + 1} ${y}`, months };
  }

  // year
  const y = now.getFullYear() + offset;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, i, 1);
    return { key: fmt(d).slice(0, 7), label: d.toLocaleDateString("es-ES", { month: "short" }) };
  });
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), months };
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}
