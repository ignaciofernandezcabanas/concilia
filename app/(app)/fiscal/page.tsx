"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { Receipt, AlertTriangle, ExternalLink, Check, X } from "lucide-react";
import { formatAmount } from "@/lib/format";
import Link from "next/link";

type Tab = "303" | "111" | "115" | "390" | "is" | "calendar";

interface Model303 {
  period: { from: string; to: string };
  devengado: {
    general21: { base: number; cuota: number };
    reducido10: { base: number; cuota: number };
    superReducido4: { base: number; cuota: number };
    otrosNoClasificados: { base: number; cuota: number };
    total: number;
  };
  deducible: {
    interiores: { base: number; cuota: number };
    importaciones: { base: number; cuota: number };
    otrosNoClasificados: { base: number; cuota: number };
    total: number;
  };
  resultado: number;
  compensacion: number;
  totalIngresar: number;
  checks: Array<{ type: string; message: string; invoiceId?: string }>;
}

interface Model111 {
  period: { from: string; to: string };
  employment: { recipients: number; base: number; withholding: number };
  professionals: { recipients: number; base: number; withholding: number };
  total: { base: number; withholding: number };
}

interface Model115 {
  period: { from: string; to: string };
  rents: { recipients: number; base: number; withholding: number };
}

interface Model390 {
  year: number;
  quarters: Array<{ quarter: number; devengado: number; deducible: number; resultado: number }>;
  annualTotals: { devengado: number; deducible: number; resultado: number };
}

interface ModelIS {
  year: number;
  baseImponible: number;
  ajustes: { gastosNoDeducibles: number; ingresosExentos: number };
  baseImponibleAjustada: number;
  tipoImpositivo: number;
  cuotaIntegra: number;
  deducciones: number;
  cuotaLiquida: number;
  retencionesYPagosACuenta: number;
  cuotaDiferencial: number;
}

interface FiscalDeadline {
  model: string;
  quarter?: number;
  description: string;
  dueDate: string;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getQuarterDates(year: number, quarter: number) {
  const from = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const endMonth = quarter * 3;
  const endDate = new Date(year, endMonth, 0);
  const to = `${year}-${String(endMonth).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { from, to };
}

/** Color for resultado amounts: red > 0, green < 0, gray = 0 */
function resultadoColor(amount: number): string {
  if (amount > 0) return "text-red-text";
  if (amount < 0) return "text-green-text";
  return "text-text-secondary";
}

interface FiscalObligationRecord {
  id: string;
  model: string;
  quarter: number | null;
  year: number;
  presentedAt: string | null;
}

export default function FiscalPage() {
  // F8-9B: Read searchParams on mount for deep linking
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) ?? "303");
  const [year, setYear] = useState(
    Number(searchParams.get("ejercicio")) || new Date().getFullYear()
  );
  const [quarter, setQuarter] = useState(
    searchParams.get("periodo")
      ? parseInt(searchParams.get("periodo")!.replace("T", ""))
      : Math.ceil((new Date().getMonth() + 1) / 3)
  );

  const { from, to } = getQuarterDates(year, quarter);

  const { data: data303 } = useFetch<Model303>(
    tab === "303" ? `/api/reports/fiscal/303?from=${from}&to=${to}` : null
  );
  const { data: data111 } = useFetch<Model111>(
    tab === "111" ? `/api/reports/fiscal/111?from=${from}&to=${to}` : null
  );
  const { data: data115 } = useFetch<Model115>(
    tab === "115" ? `/api/reports/fiscal/115?from=${from}&to=${to}` : null
  );
  const { data: data390 } = useFetch<Model390>(
    tab === "390" ? `/api/reports/fiscal/390?year=${year}` : null
  );
  const { data: dataIS, refetch: refetchIS } = useFetch<ModelIS>(
    tab === "is" ? `/api/reports/fiscal/is?year=${year}` : null
  );
  const { data: calendarData } = useFetch<{ year: number; deadlines: FiscalDeadline[] }>(
    tab === "calendar" ? `/api/reports/fiscal/calendar?year=${year}` : null
  );
  const { data: obligations, refetch: refetchObligations } = useFetch<FiscalObligationRecord[]>(
    tab === "calendar" ? `/api/fiscal/obligations?year=${year}` : null
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "303", label: "Modelo 303" },
    { id: "111", label: "Modelo 111" },
    { id: "115", label: "Modelo 115" },
    { id: "390", label: "Resumen 390" },
    { id: "is", label: "Imp. Sociedades" },
    { id: "calendar", label: "Calendario" },
  ];

  // F8-6: Quarter selector disabled (not hidden) for certain tabs
  const quarterDisabled = tab === "390" || tab === "is" || tab === "calendar";

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Receipt size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text-primary">Fiscal</h1>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-text-secondary">Ejercicio</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-7 px-2 text-[12px] border border-subtle rounded"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {/* F8-6: Always in DOM, disabled when not applicable */}
        <div
          className={`flex items-center gap-2 transition-opacity ${
            quarterDisabled ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <label className="text-[12px] text-text-secondary">Trimestre</label>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                disabled={quarterDisabled}
                className={`h-7 w-8 text-[12px] font-medium rounded ${
                  quarter === q
                    ? "bg-accent text-white"
                    : "bg-subtle text-text-secondary hover:bg-hover"
                }`}
              >
                T{q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-subtle">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "303" && <Model303View data={data303 ?? undefined} />}
      {tab === "111" && <Model111View data={data111 ?? undefined} />}
      {tab === "115" && <Model115View data={data115 ?? undefined} />}
      {tab === "390" && <Model390View data={data390 ?? undefined} />}
      {tab === "is" && <ModelISView data={dataIS ?? undefined} year={year} onUpdated={refetchIS} />}
      {tab === "calendar" && (
        <CalendarView
          deadlines={calendarData?.deadlines ?? []}
          year={year}
          obligations={obligations ?? []}
          onNavigate={(t, q) => {
            setTab(t);
            if (q) setQuarter(q);
          }}
          onTogglePresented={async (model, qtr, yr, currentlyPresented) => {
            await api.patch("/api/fiscal/obligations", {
              model,
              quarter: qtr,
              year: yr,
              presentedAt: currentlyPresented ? null : new Date().toISOString(),
            });
            refetchObligations();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-views ──

function Model303View({ data }: { data: Model303 | undefined }) {
  if (!data) return <p className="text-[12px] text-text-tertiary py-4">Cargando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <Section title="IVA devengado (repercutido)">
        {/* F8-4: Column headers */}
        <ColumnHeaders />
        <Row
          label="General 21%"
          base={data.devengado.general21.base}
          cuota={data.devengado.general21.cuota}
        />
        <Row
          label="Reducido 10%"
          base={data.devengado.reducido10.base}
          cuota={data.devengado.reducido10.cuota}
        />
        <Row
          label="Superreducido 4%"
          base={data.devengado.superReducido4.base}
          cuota={data.devengado.superReducido4.cuota}
        />
        {/* F8-1B: Unclassified catch-all row */}
        {(data.devengado.otrosNoClasificados.base !== 0 ||
          data.devengado.otrosNoClasificados.cuota !== 0) && (
          <div className="flex justify-between text-[12px]">
            <span className="text-red-text flex items-center gap-1">
              <AlertTriangle size={12} /> Tipos no clasificados
            </span>
            <div className="flex gap-6">
              <span className="font-mono text-red-text w-24 text-right">
                {formatAmount(data.devengado.otrosNoClasificados.base)}
              </span>
              <span className="font-mono text-red-text w-24 text-right">
                {formatAmount(data.devengado.otrosNoClasificados.cuota)}
              </span>
            </div>
          </div>
        )}
        <TotalRow label="Total devengado" amount={data.devengado.total} />
      </Section>

      <Section title="IVA deducible (soportado)">
        {/* F8-4: Column headers */}
        <ColumnHeaders />
        <Row
          label="Operaciones interiores"
          base={data.deducible.interiores.base}
          cuota={data.deducible.interiores.cuota}
        />
        <Row
          label="Importaciones"
          base={data.deducible.importaciones.base}
          cuota={data.deducible.importaciones.cuota}
        />
        {(data.deducible.otrosNoClasificados.base !== 0 ||
          data.deducible.otrosNoClasificados.cuota !== 0) && (
          <div className="flex justify-between text-[12px]">
            <span className="text-red-text flex items-center gap-1">
              <AlertTriangle size={12} /> Tipos no clasificados
            </span>
            <div className="flex gap-6">
              <span className="font-mono text-red-text w-24 text-right">
                {formatAmount(data.deducible.otrosNoClasificados.base)}
              </span>
              <span className="font-mono text-red-text w-24 text-right">
                {formatAmount(data.deducible.otrosNoClasificados.cuota)}
              </span>
            </div>
          </div>
        )}
        <TotalRow label="Total deducible" amount={data.deducible.total} />
      </Section>

      {/* F8-5: Use resultadoColor for zero handling */}
      <div className="bg-context rounded-lg p-4">
        <div className="flex justify-between text-[13px] font-semibold text-text-primary">
          <span>Resultado: {data.resultado >= 0 ? "A ingresar" : "A compensar"}</span>
          <span className={resultadoColor(data.resultado)}>{formatAmount(data.resultado)}</span>
        </div>
      </div>

      {/* F8-10: Verification alerts with links */}
      {data.checks.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
          <p className="text-[12px] font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={14} />
            Verificaciones
          </p>
          {data.checks.map((c, i) => {
            if (c.type === "UNUSUAL_RATE") {
              const match = c.message.match(
                /(\d+\.?\d*)%.*?(\d+).*?factura\(s\)\s+(emitida|recibida)/
              );
              const rate = match?.[1];
              const invoiceType = match?.[3] === "emitida" ? "ISSUED" : "RECEIVED";
              return (
                <div
                  key={i}
                  className="flex items-center justify-between text-[11px] text-amber-600 mb-1"
                >
                  <span>{c.message}</span>
                  {rate && (
                    <Link
                      href={`/facturas?vatRate=${rate}&type=${invoiceType}`}
                      className="text-accent hover:underline whitespace-nowrap ml-2 flex items-center gap-0.5"
                    >
                      Ver facturas <ExternalLink size={10} />
                    </Link>
                  )}
                </div>
              );
            }
            return (
              <p key={i} className="text-[11px] text-amber-600 mb-1">
                {c.message}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Model111View({ data }: { data: Model111 | undefined }) {
  if (!data) return <p className="text-[12px] text-text-tertiary py-4">Cargando...</p>;

  // F8-7: Empty state
  const isEmpty =
    data.employment.recipients === 0 &&
    data.professionals.recipients === 0 &&
    data.total.base === 0 &&
    data.total.withholding === 0;

  if (isEmpty) {
    return (
      <p className="text-[13px] text-text-tertiary py-8 text-center">
        Sin retenciones registradas en este período
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Retenciones trabajo">
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Perceptores</span>
          <span className="text-text-primary">{data.employment.recipients}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Base</span>
          <span className="font-mono text-text-primary">{formatAmount(data.employment.base)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Retención</span>
          <span className="font-mono text-text-primary">
            {formatAmount(data.employment.withholding)}
          </span>
        </div>
      </Section>

      <Section title="Retenciones profesionales">
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Perceptores</span>
          <span className="text-text-primary">{data.professionals.recipients}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Base</span>
          <span className="font-mono text-text-primary">
            {formatAmount(data.professionals.base)}
          </span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Retención</span>
          <span className="font-mono text-text-primary">
            {formatAmount(data.professionals.withholding)}
          </span>
        </div>
      </Section>

      <div className="bg-context rounded-lg p-4">
        <div className="flex justify-between text-[13px] font-semibold text-text-primary">
          <span>Total a ingresar</span>
          <span>{formatAmount(data.total.withholding)}</span>
        </div>
      </div>
    </div>
  );
}

function Model115View({ data }: { data: Model115 | undefined }) {
  if (!data) return <p className="text-[12px] text-text-tertiary py-4">Cargando...</p>;

  // F8-7: Empty state
  const isEmpty =
    data.rents.recipients === 0 && data.rents.base === 0 && data.rents.withholding === 0;

  if (isEmpty) {
    return (
      <p className="text-[13px] text-text-tertiary py-8 text-center">
        Sin retenciones registradas en este período
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Retenciones alquileres">
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Perceptores</span>
          <span className="text-text-primary">{data.rents.recipients}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Base</span>
          <span className="font-mono text-text-primary">{formatAmount(data.rents.base)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Retención</span>
          <span className="font-mono text-text-primary">
            {formatAmount(data.rents.withholding)}
          </span>
        </div>
      </Section>

      {/* F8-3: Total a ingresar for 115 */}
      <div className="bg-context rounded-lg p-4">
        <div className="flex justify-between text-[13px] font-semibold text-text-primary">
          <span>Total a ingresar</span>
          <span>{formatAmount(data.rents.withholding)}</span>
        </div>
      </div>
    </div>
  );
}

function Model390View({ data }: { data: Model390 | undefined }) {
  if (!data) return <p className="text-[12px] text-text-tertiary py-4">Cargando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-context border-b border-subtle text-[11px] text-text-secondary uppercase">
              <th className="px-4 py-2 text-left font-semibold">Trimestre</th>
              <th className="px-4 py-2 text-right font-semibold">Devengado</th>
              <th className="px-4 py-2 text-right font-semibold">Deducible</th>
              <th className="px-4 py-2 text-right font-semibold">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {data.quarters.map((q) => (
              <tr key={q.quarter} className="border-b border-subtle">
                <td className="px-4 py-2.5 font-medium">T{q.quarter}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatAmount(q.devengado)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatAmount(q.deducible)}</td>
                {/* F8-5: Zero in gray, not red */}
                <td
                  className={`px-4 py-2.5 text-right font-mono font-semibold ${resultadoColor(q.resultado)}`}
                >
                  {formatAmount(q.resultado)}
                </td>
              </tr>
            ))}
            <tr className="bg-context font-semibold">
              <td className="px-4 py-2.5">Anual</td>
              <td className="px-4 py-2.5 text-right font-mono">
                {formatAmount(data.annualTotals.devengado)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono">
                {formatAmount(data.annualTotals.deducible)}
              </td>
              <td
                className={`px-4 py-2.5 text-right font-mono ${resultadoColor(data.annualTotals.resultado)}`}
              >
                {formatAmount(data.annualTotals.resultado)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// F8-8: Editable IS view with adjustments
function ModelISView({
  data,
  year,
  onUpdated,
}: {
  data: ModelIS | undefined;
  year: number;
  onUpdated: () => void;
}) {
  const [gastos, setGastos] = useState(0);
  const [ingresos, setIngresos] = useState(0);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when data loads
  useEffect(() => {
    if (data) {
      setGastos(data.ajustes.gastosNoDeducibles);
      setIngresos(data.ajustes.ingresosExentos);
    }
  }, [data]);

  const persistAdjustments = useCallback(
    async (g: number, i: number) => {
      setSaving(true);
      try {
        await api.patch("/api/reports/fiscal/is", {
          year,
          gastosNoDeducibles: g,
          ingresosExentos: i,
        });
        onUpdated();
      } catch {
        // Silent — values are still shown locally
      } finally {
        setSaving(false);
      }
    },
    [year, onUpdated]
  );

  const debouncedPersist = useCallback(
    (g: number, i: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => persistAdjustments(g, i), 1000);
    },
    [persistAdjustments]
  );

  if (!data) return <p className="text-[12px] text-text-tertiary py-4">Cargando...</p>;

  // Client-side recalculation
  const baseAjustada = r2(data.baseImponible + gastos - ingresos);
  const cuotaIntegra = baseAjustada > 0 ? r2(baseAjustada * data.tipoImpositivo) : 0;
  const cuotaLiquida = Math.max(0, cuotaIntegra - data.deducciones);
  const cuotaDiferencial = r2(cuotaLiquida - data.retencionesYPagosACuenta);

  return (
    <div className="flex flex-col gap-4">
      <Section title={`Impuesto sobre Sociedades — Ejercicio ${data.year}`}>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Base imponible (resultado antes de impuestos)</span>
          <span className="font-mono text-text-primary">{formatAmount(data.baseImponible)}</span>
        </div>
        {/* F8-8: Editable adjustment fields */}
        <div className="flex justify-between text-[12px] items-center">
          <span className="text-text-secondary">Gastos no deducibles (+)</span>
          <input
            type="number"
            value={gastos || ""}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              setGastos(v);
              debouncedPersist(v, ingresos);
            }}
            placeholder="0,00"
            className="font-mono text-text-primary text-right w-32 h-7 px-2 text-[12px] border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex justify-between text-[12px] items-center">
          <span className="text-text-secondary">Ingresos exentos (-)</span>
          <input
            type="number"
            value={ingresos || ""}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              setIngresos(v);
              debouncedPersist(gastos, v);
            }}
            placeholder="0,00"
            className="font-mono text-text-primary text-right w-32 h-7 px-2 text-[12px] border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <TotalRow label="Base imponible ajustada" amount={baseAjustada} />
      </Section>

      <Section title="Liquidación">
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">
            Tipo impositivo: {(data.tipoImpositivo * 100).toFixed(0)}%
          </span>
          <span className="font-mono text-text-primary">{formatAmount(cuotaIntegra)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Deducciones</span>
          <span className="font-mono text-text-primary">{formatAmount(data.deducciones)}</span>
        </div>
        <TotalRow label="Cuota líquida" amount={cuotaLiquida} />
      </Section>

      <Section title="Resultado">
        <div className="flex justify-between text-[12px]">
          <span className="text-text-secondary">Retenciones y pagos a cuenta</span>
          <span className="font-mono text-text-primary">
            {formatAmount(data.retencionesYPagosACuenta)}
          </span>
        </div>
      </Section>

      {/* F8-5: Use resultadoColor for zero handling */}
      <div className="bg-context rounded-lg p-4">
        <div className="flex justify-between text-[13px] font-semibold text-text-primary">
          <span>Cuota diferencial: {cuotaDiferencial >= 0 ? "A ingresar" : "A devolver"}</span>
          <span className={resultadoColor(cuotaDiferencial)}>{formatAmount(cuotaDiferencial)}</span>
        </div>
      </div>

      {saving && <p className="text-[11px] text-text-tertiary text-center">Guardando ajustes...</p>}

      <p className="text-[11px] text-text-tertiary leading-relaxed">
        Este cálculo es una estimación basada en los datos contabilizados. Los ajustes
        extracontables deben ser validados por un asesor fiscal.
      </p>
    </div>
  );
}

// F8-9: Interactive calendar with navigation + presentation tracking
function CalendarView({
  deadlines,
  year,
  obligations,
  onNavigate,
  onTogglePresented,
}: {
  deadlines: FiscalDeadline[];
  year: number;
  obligations: FiscalObligationRecord[];
  onNavigate: (tab: Tab, quarter?: number) => void;
  onTogglePresented: (
    model: string,
    quarter: number | null,
    year: number,
    currentlyPresented: boolean
  ) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const handleClick = (dl: FiscalDeadline) => {
    const tabMap: Record<string, Tab> = {
      "303": "303",
      "111": "111",
      "115": "115",
      "390": "390",
      IS: "is",
    };
    const targetTab = tabMap[dl.model];
    if (targetTab) {
      onNavigate(targetTab, dl.quarter);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {deadlines.length === 0 ? (
        <p className="text-[12px] text-text-tertiary py-4">Sin vencimientos</p>
      ) : (
        deadlines.map((dl, i) => {
          // Check if this obligation has been marked as presented
          const isPresented = obligations.some(
            (o) =>
              o.model === dl.model &&
              o.quarter === (dl.quarter ?? null) &&
              o.year === year &&
              o.presentedAt !== null
          );

          const diffMs = new Date(dl.dueDate).getTime() - new Date(today).getTime();
          const daysUntil = Math.ceil(diffMs / 86400000);
          const isPast = daysUntil < 0;
          const isUrgent = !isPast && daysUntil <= 5;
          const isWarning = !isPast && !isUrgent && daysUntil <= 15;
          const isNear = !isPast && !isUrgent && !isWarning && daysUntil <= 30;

          let badgeClass: string;
          let badgeText: string;
          let borderClass: string;

          if (isPresented) {
            badgeClass = "bg-green-100 text-green-700";
            badgeText = "Presentado";
            borderClass = "border-green-200 bg-green-50";
          } else if (isPast) {
            badgeClass = "bg-red-100 text-red-700";
            badgeText = "Vencido";
            borderClass = "border-red-200 bg-red-50";
          } else if (isUrgent) {
            badgeClass = "bg-red-100 text-red-700";
            badgeText = `Urgente · ${daysUntil}d`;
            borderClass = "border-red-200 bg-red-50";
          } else if (isWarning) {
            badgeClass = "bg-yellow-100 text-yellow-700";
            badgeText = `${daysUntil} días`;
            borderClass = "border-yellow-200 bg-yellow-50";
          } else if (isNear) {
            badgeClass = "bg-amber-100 text-amber-700";
            badgeText = `${daysUntil} días`;
            borderClass = "border-amber-200 bg-amber-50";
          } else {
            badgeClass = "bg-subtle text-text-tertiary";
            badgeText = "Pendiente";
            borderClass = "border-subtle";
          }

          return (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${borderClass} hover:shadow-sm transition-shadow`}
            >
              <button onClick={() => handleClick(dl)} className="text-left flex-1 cursor-pointer">
                <p className="text-[13px] font-medium text-text-primary">{dl.description}</p>
                <p className="text-[11px] text-text-secondary">Vencimiento: {dl.dueDate}</p>
              </button>
              <div className="flex items-center gap-2 ml-3">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}
                >
                  {badgeText}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePresented(dl.model, dl.quarter ?? null, year, isPresented);
                  }}
                  title={isPresented ? "Desmarcar presentado" : "Marcar como presentado"}
                  className={`p-1 rounded-full transition-colors ${
                    isPresented
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-subtle text-text-tertiary hover:bg-hover hover:text-text-primary"
                  }`}
                >
                  {isPresented ? <X size={12} /> : <Check size={12} />}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Shared components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-subtle rounded-lg p-4">
      <p className="text-[11px] text-text-tertiary uppercase font-semibold mb-3">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

/** F8-4: Column headers for 303 sections */
function ColumnHeaders() {
  return (
    <div className="flex justify-between text-[11px] text-text-tertiary uppercase font-semibold pb-1 mb-1 border-b border-subtle/50">
      <span>Concepto</span>
      <div className="flex gap-6">
        <span className="w-24 text-right">Base imponible</span>
        <span className="w-24 text-right">Cuota IVA</span>
      </div>
    </div>
  );
}

function Row({ label, base, cuota }: { label: string; base: number; cuota: number }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-text-secondary">{label}</span>
      <div className="flex gap-6">
        <span className="font-mono text-text-primary w-24 text-right">{formatAmount(base)}</span>
        <span className="font-mono text-text-primary w-24 text-right">{formatAmount(cuota)}</span>
      </div>
    </div>
  );
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between text-[12px] font-semibold pt-1 border-t border-subtle mt-1">
      <span className="text-text-primary">{label}</span>
      <span className="font-mono text-text-primary">{formatAmount(amount)}</span>
    </div>
  );
}
