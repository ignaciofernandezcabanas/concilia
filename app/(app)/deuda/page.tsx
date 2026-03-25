"use client";

import { useState, useEffect } from "react";
import { Plus, ChevronDown, ChevronRight, Landmark, AlertTriangle, Check } from "lucide-react";
import { formatNumber } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleEntry {
  id: string;
  entryNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  outstandingAfter: number;
  matched: boolean;
}

interface DebtTx {
  id: string;
  type: string;
  date: string;
  amount: number;
  pgcDebitAccount: string;
  pgcCreditAccount: string;
  notes?: string;
}

interface Covenant {
  id: string;
  debtInstrumentName: string;
  name: string;
  metric: string;
  threshold: number;
  operator: string;
  lastTestedValue: number | null;
  isCompliant: boolean | null;
  status: string;
}

interface DebtInstrument {
  id: string;
  name: string;
  type: string;
  bankEntityName: string;
  principalAmount: number;
  outstandingBalance: number;
  interestRateType: string;
  interestRateValue: number;
  startDate: string;
  maturityDate: string;
  paymentFrequency: string;
  creditLimit: number | null;
  currentDrawdown: number | null;
  status: string;
  schedule: ScheduleEntry[];
  covenants: unknown[];
}

interface Summary {
  totalDebt: number;
  cashBalance: number;
  netDebt: number;
  totalCreditLimit: number;
  availableCredit: number;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  TERM_LOAN: "Pr\u00e9stamo",
  REVOLVING_CREDIT: "P\u00f3liza cr\u00e9dito",
  DISCOUNT_LINE: "L\u00ednea descuento",
  CONFIRMING: "Confirming",
  FINANCE_LEASE: "Leasing",
  OVERDRAFT: "Descubierto",
  GUARANTEE: "Aval",
};

const TYPE_COLORS: Record<string, string> = {
  TERM_LOAN: "bg-blue-100 text-blue-700",
  REVOLVING_CREDIT: "bg-purple-100 text-purple-700",
  DISCOUNT_LINE: "bg-amber-100 text-amber-700",
  CONFIRMING: "bg-green-100 text-green-700",
  FINANCE_LEASE: "bg-accent/10 text-accent",
  OVERDRAFT: "bg-red-100 text-red-600",
  GUARANTEE: "bg-hover text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  MATURED: "Vencido",
  REFINANCED: "Refinanciado",
  DEFAULT: "Default",
};

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  ON_DEMAND: "A demanda",
  BULLET: "Bullet",
};

const TX_LABELS: Record<string, string> = {
  DRAWDOWN: "Disposici\u00f3n",
  REPAYMENT: "Amortizaci\u00f3n",
  INSTALLMENT_PRINCIPAL: "Cuota principal",
  INSTALLMENT_INTEREST: "Cuota inter\u00e9s",
  INTEREST_PAYMENT: "Pago intereses",
  COMMISSION: "Comisi\u00f3n",
  INTEREST_ACCRUAL: "Devengo inter\u00e9s",
  RECLASSIFICATION_LP_CP: "Reclass. LP\u2192CP",
  DISCOUNT_ADVANCE: "Anticipo dto.",
  DISCOUNT_SETTLEMENT: "Liquid. dto.",
  DISCOUNT_DEFAULT: "Impago dto.",
  EARLY_REPAYMENT: "Amort. anticipada",
  LEASE_PAYMENT: "Cuota leasing",
};

const OPERATOR_LABELS: Record<string, string> = {
  LT: "<",
  LTE: "\u2264",
  GT: ">",
  GTE: "\u2265",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  TERM_LOAN: "Pr\u00e9stamo a plazo con cuotas peri\u00f3dicas (sistema franc\u00e9s)",
  REVOLVING_CREDIT: "P\u00f3liza de cr\u00e9dito renovable con l\u00edmite",
  DISCOUNT_LINE: "L\u00ednea de descuento comercial de efectos",
  CONFIRMING: "Servicio de pago confirmado a proveedores",
  FINANCE_LEASE: "Arrendamiento financiero con opci\u00f3n de compra",
  OVERDRAFT: "Facilidad de descubierto en cuenta corriente",
  GUARANTEE: "Aval bancario o garant\u00eda prestada",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeudaPage() {
  const [instruments, setInstruments] = useState<DebtInstrument[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [covenants, setCovenants] = useState<Covenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "",
    name: "",
    bankEntityName: "",
    principalAmount: 0,
    interestRateType: "FIXED" as "FIXED" | "VARIABLE",
    interestRateValue: 0,
    startDate: new Date().toISOString().slice(0, 10),
    maturityDate: "",
    paymentFrequency: "MONTHLY",
    creditLimit: 0,
    paymentDay: 5,
    gracePeriodEndDate: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [instRes, summaryRes, covRes] = await Promise.all([
        fetch("/api/debt-instruments").then((r) => r.json()),
        fetch("/api/debt-instruments/summary").then((r) => r.json()),
        fetch("/api/debt-instruments/covenants").then((r) => r.json()),
      ]);
      setInstruments(instRes.data ?? []);
      setSummary(summaryRes);
      setCovenants(covRes.data ?? []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  const fmt = formatNumber;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-ES");

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isRevolving = (t: string) =>
    t === "REVOLVING_CREDIT" || t === "OVERDRAFT" || t === "DISCOUNT_LINE";

  async function handleCreate() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        type: form.type,
        bankEntityName: form.bankEntityName,
        principalAmount: Number(form.principalAmount),
        interestRateType: form.interestRateType,
        interestRateValue: Number(form.interestRateValue),
        startDate: form.startDate,
        maturityDate: form.maturityDate,
        paymentFrequency: form.paymentFrequency,
        paymentDay: Number(form.paymentDay),
      };
      if (isRevolving(form.type)) {
        body.creditLimit = Number(form.creditLimit);
      }
      if (form.gracePeriodEndDate) {
        body.gracePeriodEndDate = form.gracePeriodEndDate;
      }
      const res = await fetch("/api/debt-instruments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowWizard(false);
        setWizardStep(1);
        setForm({
          type: "",
          name: "",
          bankEntityName: "",
          principalAmount: 0,
          interestRateType: "FIXED",
          interestRateValue: 0,
          startDate: new Date().toISOString().slice(0, 10),
          maturityDate: "",
          paymentFrequency: "MONTHLY",
          creditLimit: 0,
          paymentDay: 5,
          gracePeriodEndDate: "",
        });
        await loadData();
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  const liquidezTotal = (summary?.cashBalance ?? 0) + (summary?.availableCredit ?? 0);

  if (loading) return <div className="p-8 text-text-secondary">Cargando deuda...</div>;

  return (
    <div className="p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Posici&oacute;n de deuda</h1>
          <p className="text-sm text-text-secondary mt-1">
            Instrumentos financieros, cuadros de amortizaci&oacute;n y covenants.
          </p>
        </div>
        <button
          onClick={() => {
            setShowWizard(true);
            setWizardStep(1);
          }}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90"
        >
          <Plus size={16} /> Nuevo instrumento
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="border border-border rounded-lg p-4">
            <p className="text-[10px] text-text-tertiary uppercase">Deuda total</p>
            <p className="text-xl font-semibold font-mono mt-1">{fmt(summary.totalDebt)} &euro;</p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <p className="text-[10px] text-text-tertiary uppercase">Caja</p>
            <p className="text-xl font-semibold font-mono mt-1">
              {fmt(summary.cashBalance)} &euro;
            </p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <p className="text-[10px] text-text-tertiary uppercase">Deuda neta</p>
            <p
              className={`text-xl font-semibold font-mono mt-1 ${summary.netDebt > 0 ? "text-red-600" : "text-green-700"}`}
            >
              {fmt(summary.netDebt)} &euro;
            </p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <p className="text-[10px] text-text-tertiary uppercase">Disponible l&iacute;neas</p>
            <p className="text-xl font-semibold font-mono mt-1">
              {fmt(summary.availableCredit)} &euro;
            </p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <p className="text-[10px] text-text-tertiary uppercase">Liquidez total</p>
            <p className="text-xl font-semibold font-mono mt-1">{fmt(liquidezTotal)} &euro;</p>
          </div>
        </div>
      )}

      {/* Create wizard modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nuevo instrumento de deuda</h3>
              <span className="text-xs text-text-tertiary">Paso {wizardStep} de 3</span>
            </div>

            {/* Step 1: Type */}
            {wizardStep === 1 && (
              <div className="space-y-2">
                <p className="text-sm text-text-secondary mb-3">Selecciona el tipo:</p>
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setForm((f) => ({ ...f, type: key }));
                      setWizardStep(2);
                    }}
                    className={`w-full text-left border rounded-lg p-3 hover:border-accent transition-colors ${
                      form.type === key ? "border-accent bg-accent/5" : "border-border"
                    }`}
                  >
                    <span className="font-medium text-sm">{label}</span>
                    <span className="block text-xs text-text-tertiary mt-0.5">
                      {TYPE_DESCRIPTIONS[key]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Details */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Nombre *</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-sm"
                      placeholder="Pr\u00e9stamo ICO Santander"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Banco *</label>
                    <input
                      value={form.bankEntityName}
                      onChange={(e) => setForm((f) => ({ ...f, bankEntityName: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-sm"
                      placeholder="Santander"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      {isRevolving(form.type) ? "L\u00edmite" : "Principal"} *
                    </label>
                    <input
                      type="number"
                      value={form.principalAmount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, principalAmount: Number(e.target.value) }))
                      }
                      className="w-full border border-border rounded px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                  {isRevolving(form.type) && (
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">
                        L&iacute;mite cr&eacute;dito *
                      </label>
                      <input
                        type="number"
                        value={form.creditLimit}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, creditLimit: Number(e.target.value) }))
                        }
                        className="w-full border border-border rounded px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      Tipo inter&eacute;s
                    </label>
                    <select
                      value={form.interestRateType}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          interestRateType: e.target.value as "FIXED" | "VARIABLE",
                        }))
                      }
                      className="w-full border border-border rounded px-3 py-1.5 text-sm"
                    >
                      <option value="FIXED">Fijo</option>
                      <option value="VARIABLE">Variable</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Tipo (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.interestRateValue}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, interestRateValue: Number(e.target.value) }))
                      }
                      className="w-full border border-border rounded px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Fecha inicio</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Vencimiento *</label>
                    <input
                      type="date"
                      value={form.maturityDate}
                      onChange={(e) => setForm((f) => ({ ...f, maturityDate: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      Frecuencia pago
                    </label>
                    <select
                      value={form.paymentFrequency}
                      onChange={(e) => setForm((f) => ({ ...f, paymentFrequency: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-sm"
                    >
                      {Object.entries(FREQ_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      D&iacute;a pago
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={form.paymentDay}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, paymentDay: Number(e.target.value) }))
                      }
                      className="w-full border border-border rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="text-xs text-text-secondary px-3 py-1.5"
                  >
                    Atr&aacute;s
                  </button>
                  <button
                    onClick={() => setWizardStep(3)}
                    disabled={!form.name || !form.bankEntityName || !form.maturityDate}
                    className="text-xs bg-accent text-white px-4 py-1.5 rounded hover:bg-accent/90 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Schedule */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                {form.type === "TERM_LOAN" || form.type === "FINANCE_LEASE" ? (
                  <div>
                    <p className="text-sm text-text-secondary mb-2">
                      El cuadro de amortizaci&oacute;n se generar&aacute; autom&aacute;ticamente con
                      sistema franc&eacute;s.
                    </p>
                    <div className="bg-page border border-border rounded-lg p-3 text-xs text-text-secondary">
                      <p>Principal: {fmt(form.principalAmount)} &euro;</p>
                      <p>
                        Tipo: {form.interestRateValue}%{" "}
                        {form.interestRateType === "FIXED" ? "fijo" : "variable"}
                      </p>
                      <p>
                        Plazo: {form.startDate} &rarr; {form.maturityDate}
                      </p>
                      <p>Frecuencia: {FREQ_LABELS[form.paymentFrequency]}</p>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-text-secondary mb-1">
                        Carencia hasta (opcional)
                      </label>
                      <input
                        type="date"
                        value={form.gracePeriodEndDate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, gracePeriodEndDate: e.target.value }))
                        }
                        className="w-full border border-border rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">
                    Este tipo de instrumento no requiere cuadro de amortizaci&oacute;n.
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setWizardStep(2)}
                    className="text-xs text-text-secondary px-3 py-1.5"
                  >
                    Atr&aacute;s
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={saving}
                    className="text-xs bg-accent text-white px-4 py-1.5 rounded hover:bg-accent/90 disabled:opacity-50"
                  >
                    {saving ? "Creando..." : "Crear instrumento"}
                  </button>
                  <button
                    onClick={() => setShowWizard(false)}
                    className="text-xs text-text-secondary px-3 py-1.5"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instruments table */}
      <div className="border border-border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-page border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">
                Nombre
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-text-secondary">Tipo</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-text-secondary">Banco</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-text-secondary">
                Saldo vivo
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-text-secondary">
                Cuota / L&iacute;mite
              </th>
              <th className="text-center px-3 py-2 text-xs font-medium text-text-secondary">
                Vencimiento
              </th>
              <th className="text-center px-3 py-2 text-xs font-medium text-text-secondary">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {instruments.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-text-tertiary py-8 text-sm">
                  Sin instrumentos de deuda registrados.
                </td>
              </tr>
            )}
            {instruments.map((inst) => {
              const isExp = expanded.has(inst.id);
              const nextInstallment = inst.schedule?.[0];
              return (
                <InstrumentRow
                  key={inst.id}
                  inst={inst}
                  isExp={isExp}
                  nextInstallment={nextInstallment}
                  onToggle={() => toggleExpand(inst.id)}
                  fmt={fmt}
                  fmtDate={fmtDate}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Covenants section */}
      {covenants.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Covenants</h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-page border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">
                    Instrumento
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-secondary">
                    Covenant
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-secondary">
                    Umbral
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-secondary">
                    Valor actual
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-secondary">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {covenants.map((cov) => (
                  <tr key={cov.id} className="border-b border-border">
                    <td className="px-4 py-2 text-text-primary">{cov.debtInstrumentName}</td>
                    <td className="px-3 py-2 text-text-secondary">{cov.name}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">
                      {OPERATOR_LABELS[cov.operator] ?? cov.operator} {cov.threshold}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs">
                      {cov.lastTestedValue != null ? cov.lastTestedValue.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CovenantChip status={cov.status} isCompliant={cov.isCompliant} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InstrumentRow({
  inst,
  isExp,
  nextInstallment,
  onToggle,
  fmt,
  fmtDate,
}: {
  inst: DebtInstrument;
  isExp: boolean;
  nextInstallment?: ScheduleEntry;
  onToggle: () => void;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
}) {
  const isRevolvingType =
    inst.type === "REVOLVING_CREDIT" || inst.type === "OVERDRAFT" || inst.type === "DISCOUNT_LINE";

  const [detail, setDetail] = useState<DebtInstrument | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function handleToggle() {
    onToggle();
    if (!isExp && !detail) {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/debt-instruments/${inst.id}`);
        if (res.ok) setDetail(await res.json());
      } catch {
        /* ignore */
      }
      setLoadingDetail(false);
    }
  }

  const fullInst = detail ?? inst;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-hover cursor-pointer row-hover"
        onClick={handleToggle}
      >
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Landmark size={14} className="text-text-tertiary" />
            <span className="font-medium">{inst.name}</span>
          </div>
        </td>
        <td className="px-3 py-2">
          <span
            className={`text-[11px] px-2 py-0.5 rounded ${TYPE_COLORS[inst.type] ?? "bg-hover"}`}
          >
            {TYPE_LABELS[inst.type] ?? inst.type}
          </span>
        </td>
        <td className="px-3 py-2 text-text-secondary text-xs">{inst.bankEntityName}</td>
        <td className="px-3 py-2 text-right font-mono text-xs">{fmt(inst.outstandingBalance)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {isRevolvingType
            ? `${fmt(inst.creditLimit ?? 0)}`
            : nextInstallment
              ? fmt(nextInstallment.totalAmount)
              : "\u2014"}
        </td>
        <td className="px-3 py-2 text-center text-xs">{fmtDate(inst.maturityDate)}</td>
        <td className="px-3 py-2 text-center">
          <span
            className={`text-[10px] px-2 py-0.5 rounded ${
              inst.status === "ACTIVE"
                ? "bg-green-50 text-green-600"
                : inst.status === "DEFAULT"
                  ? "bg-red-50 text-red-600"
                  : "bg-hover text-gray-500"
            }`}
          >
            {STATUS_LABELS[inst.status] ?? inst.status}
          </span>
        </td>
      </tr>
      {isExp && (
        <tr>
          <td colSpan={7} className="bg-page px-6 py-3">
            {loadingDetail ? (
              <p className="text-xs text-text-tertiary">Cargando detalle...</p>
            ) : isRevolvingType ? (
              <RevolvingDetail inst={fullInst} fmt={fmt} fmtDate={fmtDate} />
            ) : (
              <TermDetail inst={fullInst} fmt={fmt} fmtDate={fmtDate} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function TermDetail({
  inst,
  fmt,
  fmtDate,
}: {
  inst: DebtInstrument;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
}) {
  const schedule = inst.schedule ?? [];
  if (schedule.length === 0)
    return <p className="text-xs text-text-tertiary">Sin cuadro de amortizaci&oacute;n.</p>;

  return (
    <div>
      <p className="text-[10px] text-text-tertiary uppercase mb-1">Cuadro de amortizaci&oacute;n</p>
      <div className="max-h-60 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1 px-2">#</th>
              <th className="text-left py-1 px-2">Fecha</th>
              <th className="text-right py-1 px-2">Principal</th>
              <th className="text-right py-1 px-2">Inter&eacute;s</th>
              <th className="text-right py-1 px-2">Total</th>
              <th className="text-right py-1 px-2">Pendiente</th>
              <th className="text-center py-1 px-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((e) => {
              const isPast = new Date(e.dueDate) < new Date();
              return (
                <tr
                  key={e.id}
                  className={`border-b border-border/50 ${
                    e.matched ? "text-green-600" : isPast ? "text-red-500" : "text-text-secondary"
                  }`}
                >
                  <td className="py-1 px-2">{e.entryNumber}</td>
                  <td className="py-1 px-2">{fmtDate(e.dueDate)}</td>
                  <td className="py-1 px-2 text-right font-mono">{fmt(e.principalAmount)}</td>
                  <td className="py-1 px-2 text-right font-mono">{fmt(e.interestAmount)}</td>
                  <td className="py-1 px-2 text-right font-mono">{fmt(e.totalAmount)}</td>
                  <td className="py-1 px-2 text-right font-mono">{fmt(e.outstandingAfter)}</td>
                  <td className="py-1 px-2 text-center">
                    {e.matched ? (
                      <Check size={12} className="inline text-green-600" />
                    ) : isPast ? (
                      <AlertTriangle size={12} className="inline text-red-500" />
                    ) : (
                      <span className="text-text-tertiary">&mdash;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RevolvingDetail({
  inst,
  fmt,
  fmtDate,
}: {
  inst: DebtInstrument;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
}) {
  const limit = inst.creditLimit ?? 0;
  const drawn = inst.currentDrawdown ?? 0;
  const pct = limit > 0 ? (drawn / limit) * 100 : 0;
  const transactions = (inst as DebtInstrument & { transactions?: DebtTx[] }).transactions ?? [];

  return (
    <div className="space-y-3">
      {/* Drawdown bar */}
      <div>
        <p className="text-[10px] text-text-tertiary uppercase mb-1">
          Disposici&oacute;n: {fmt(drawn)} / {fmt(limit)} &euro;
        </p>
        <div className="w-full bg-hover rounded-full h-3">
          <div
            className={`h-3 rounded-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-accent"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-text-tertiary mt-0.5">
          Disponible: {fmt(limit - drawn)} &euro; ({(100 - pct).toFixed(0)}%)
        </p>
      </div>
      {/* Recent movements */}
      {transactions.length > 0 && (
        <div>
          <p className="text-[10px] text-text-tertiary uppercase mb-1">
            &Uacute;ltimos movimientos
          </p>
          {transactions.slice(0, 5).map((tx) => (
            <div
              key={tx.id}
              className="flex items-center text-xs py-1 border-b border-border-light last:border-0"
            >
              <span className="w-20 text-text-tertiary">{fmtDate(tx.date)}</span>
              <span className="w-36 text-text-secondary">{TX_LABELS[tx.type] ?? tx.type}</span>
              <span className="font-mono text-text-primary">{fmt(tx.amount)} &euro;</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CovenantChip({ status, isCompliant }: { status: string; isCompliant: boolean | null }) {
  if (isCompliant === null || status === "PENDING") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded bg-hover text-gray-500">Pendiente</span>
    );
  }
  if (isCompliant) {
    return <span className="text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-600">OK</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600">Incumplido</span>;
}
