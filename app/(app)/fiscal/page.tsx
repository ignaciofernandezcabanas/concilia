"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useApi";
import { Receipt, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatAmount } from "@/lib/format";

type Tab = "303" | "111" | "115" | "390" | "calendar";

interface Model303 {
  period: { from: string; to: string };
  devengado: {
    general21: { base: number; cuota: number };
    reducido10: { base: number; cuota: number };
    superReducido4: { base: number; cuota: number };
    total: number;
  };
  deducible: {
    interiores: { base: number; cuota: number };
    importaciones: { base: number; cuota: number };
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

interface FiscalDeadline {
  model: string;
  quarter?: number;
  description: string;
  dueDate: string;
}

function getQuarterDates(year: number, quarter: number) {
  const from = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const endMonth = quarter * 3;
  const endDate = new Date(year, endMonth, 0);
  const to = `${year}-${String(endMonth).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { from, to };
}

export default function FiscalPage() {
  const [tab, setTab] = useState<Tab>("303");
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));

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
  const { data: calendarData } = useFetch<{ year: number; deadlines: FiscalDeadline[] }>(
    tab === "calendar" ? `/api/reports/fiscal/calendar?year=${year}` : null
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "303", label: "Modelo 303" },
    { id: "111", label: "Modelo 111" },
    { id: "115", label: "Modelo 115" },
    { id: "390", label: "Resumen 390" },
    { id: "calendar", label: "Calendario" },
  ];

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
        {tab !== "390" && tab !== "calendar" && (
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-text-secondary">Trimestre</label>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4].map((q) => (
                <button
                  key={q}
                  onClick={() => setQuarter(q)}
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
        )}
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
      {tab === "calendar" && <CalendarView deadlines={calendarData?.deadlines ?? []} />}
    </div>
  );
}

// ── Sub-views ──

function Model303View({ data }: { data: Model303 | undefined }) {
  if (!data) return <p className="text-[12px] text-text-tertiary py-4">Cargando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <Section title="IVA devengado (repercutido)">
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
        <TotalRow label="Total devengado" amount={data.devengado.total} />
      </Section>

      <Section title="IVA deducible (soportado)">
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
        <TotalRow label="Total deducible" amount={data.deducible.total} />
      </Section>

      <div className="bg-context rounded-lg p-4">
        <div className="flex justify-between text-[13px] font-semibold text-text-primary">
          <span>Resultado: {data.resultado >= 0 ? "A ingresar" : "A compensar"}</span>
          <span className={data.resultado >= 0 ? "text-red-text" : "text-green-text"}>
            {formatAmount(data.resultado)}
          </span>
        </div>
      </div>

      {data.checks.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
          <p className="text-[12px] font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={14} />
            Verificaciones
          </p>
          {data.checks.map((c, i) => (
            <p key={i} className="text-[11px] text-amber-600 mb-1">
              {c.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Model111View({ data }: { data: Model111 | undefined }) {
  if (!data) return <p className="text-[12px] text-text-tertiary py-4">Cargando...</p>;

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
          <span className="text-text-secondary">Retenci&oacute;n</span>
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
          <span className="text-text-secondary">Retenci&oacute;n</span>
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
          <span className="text-text-secondary">Retenci&oacute;n</span>
          <span className="font-mono text-text-primary">
            {formatAmount(data.rents.withholding)}
          </span>
        </div>
      </Section>
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
                <td
                  className={`px-4 py-2.5 text-right font-mono font-semibold ${q.resultado >= 0 ? "text-red-text" : "text-green-text"}`}
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
                className={`px-4 py-2.5 text-right font-mono ${data.annualTotals.resultado >= 0 ? "text-red-text" : "text-green-text"}`}
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

function CalendarView({ deadlines }: { deadlines: FiscalDeadline[] }) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      {deadlines.length === 0 ? (
        <p className="text-[12px] text-text-tertiary py-4">Sin vencimientos</p>
      ) : (
        deadlines.map((dl, i) => {
          const isPast = dl.dueDate < today;
          const isNear =
            !isPast &&
            dl.dueDate <= new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

          return (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                isPast
                  ? "border-green-200 bg-green-50"
                  : isNear
                    ? "border-amber-200 bg-amber-50"
                    : "border-subtle"
              }`}
            >
              <div className="flex items-center gap-2">
                {isPast ? (
                  <CheckCircle2 size={16} className="text-green-600" />
                ) : isNear ? (
                  <Calendar size={16} className="text-amber-600" />
                ) : (
                  <Calendar size={16} className="text-text-tertiary" />
                )}
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{dl.description}</p>
                  <p className="text-[11px] text-text-secondary">Vencimiento: {dl.dueDate}</p>
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  isPast
                    ? "bg-green-100 text-green-700"
                    : isNear
                      ? "bg-amber-100 text-amber-700"
                      : "bg-subtle text-text-tertiary"
                }`}
              >
                {isPast ? "Presentado" : isNear ? "Pr\u00f3ximo" : "Pendiente"}
              </span>
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
