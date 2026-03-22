"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Building2, Landmark, BookOpen, ArrowRight, Check, Plus, X } from "lucide-react";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Company
  const [name, setName] = useState("");
  const [cif, setCif] = useState("");
  const [currency, setCurrency] = useState("EUR");

  // Step 2: Bank accounts
  const [accounts, setAccounts] = useState([{ iban: "", bankName: "", alias: "" }]);

  // Step 3: PGC
  const [loadPgc, setLoadPgc] = useState(true);

  function addAccount() {
    setAccounts((prev) => [...prev, { iban: "", bankName: "", alias: "" }]);
  }

  function removeAccount(i: number) {
    if (accounts.length <= 1) return;
    setAccounts((prev) => prev.filter((_, j) => j !== i));
  }

  function updateAccount(i: number, field: string, value: string) {
    setAccounts((prev) => prev.map((a, j) => j === i ? { ...a, [field]: value } : a));
  }

  async function handleComplete() {
    setSaving(true);
    setError("");
    try {
      await api.post("/api/onboarding", {
        company: { name, cif, currency },
        bankAccounts: accounts.filter((a) => a.iban.trim()),
        loadPgc,
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la empresa");
    } finally {
      setSaving(false);
    }
  }

  const canAdvance1 = name.trim().length > 0 && cif.trim().length > 0;
  const canAdvance2 = accounts.some((a) => a.iban.trim().length > 0);

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-8">
      <div className="bg-white rounded-xl border border-subtle shadow-sm w-full max-w-lg p-8">
        {/* Progress */}
        <div className="flex items-center gap-3 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold ${
                step > s ? "bg-green text-white" : step === s ? "bg-accent text-white" : "bg-hover text-text-tertiary"
              }`}>
                {step > s ? <Check size={14} /> : s}
              </div>
              <span className={`text-[12px] ${step >= s ? "text-text-primary" : "text-text-tertiary"}`}>
                {s === 1 ? "Empresa" : s === 2 ? "Cuentas" : "Plan contable"}
              </span>
              {s < 3 && <div className={`flex-1 h-px ${step > s ? "bg-green" : "bg-subtle"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Company */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 mb-2">
              <Building2 size={24} className="text-accent" />
              <div>
                <h1 className="text-[18px] font-semibold text-text-primary">Datos de la empresa</h1>
                <p className="text-[12px] text-text-secondary">Configura tu empresa para empezar a conciliar.</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Nombre de la empresa</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi Empresa S.L." className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">CIF / NIF</label>
              <input type="text" value={cif} onChange={(e) => setCif(e.target.value.toUpperCase())} placeholder="B12345678" className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md">
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — Dólar</option>
                <option value="GBP">GBP — Libra</option>
              </select>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canAdvance1}
              className="h-10 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent-dark disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Siguiente <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Step 2: Bank accounts */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 mb-2">
              <Landmark size={24} className="text-accent" />
              <div>
                <h1 className="text-[18px] font-semibold text-text-primary">Cuentas bancarias</h1>
                <p className="text-[12px] text-text-secondary">Añade los IBANs de tus cuentas propias. Se usan para detectar transferencias internas.</p>
              </div>
            </div>

            {accounts.map((acc, i) => (
              <div key={i} className="flex flex-col gap-2 p-3 bg-page rounded-md border border-border-light">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-text-secondary">Cuenta {i + 1}</span>
                  {accounts.length > 1 && (
                    <button onClick={() => removeAccount(i)} className="text-text-tertiary hover:text-red"><X size={14} /></button>
                  )}
                </div>
                <input
                  type="text"
                  value={acc.iban}
                  onChange={(e) => updateAccount(i, "iban", e.target.value)}
                  placeholder="ES12 3456 7890 1234 5678 9012"
                  className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md font-mono"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={acc.bankName}
                    onChange={(e) => updateAccount(i, "bankName", e.target.value)}
                    placeholder="Banco (opcional)"
                    className="flex-1 h-8 px-3 text-[12px] border border-subtle rounded-md"
                  />
                  <input
                    type="text"
                    value={acc.alias}
                    onChange={(e) => updateAccount(i, "alias", e.target.value)}
                    placeholder="Alias (opcional)"
                    className="flex-1 h-8 px-3 text-[12px] border border-subtle rounded-md"
                  />
                </div>
              </div>
            ))}

            <button onClick={addAccount} className="text-[12px] text-accent font-medium self-start flex items-center gap-1">
              <Plus size={12} /> Añadir otra cuenta
            </button>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 h-10 border border-subtle text-[13px] text-text-secondary rounded-md hover:bg-hover">
                Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canAdvance2}
                className="flex-1 h-10 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent-dark disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Siguiente <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: PGC */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 mb-2">
              <BookOpen size={24} className="text-accent" />
              <div>
                <h1 className="text-[18px] font-semibold text-text-primary">Plan de cuentas</h1>
                <p className="text-[12px] text-text-secondary">El plan contable se usa para clasificar transacciones y generar reportes.</p>
              </div>
            </div>

            <label className="flex items-start gap-3 p-4 border border-subtle rounded-lg cursor-pointer hover:bg-page">
              <input type="radio" checked={loadPgc} onChange={() => setLoadPgc(true)} className="mt-0.5" />
              <div>
                <span className="text-[13px] font-medium text-text-primary block">Cargar PGC estándar para PYMEs</span>
                <span className="text-[11px] text-text-secondary">Incluye ~50 cuentas más comunes del Plan General Contable español. Recomendado.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 border border-subtle rounded-lg cursor-pointer hover:bg-page">
              <input type="radio" checked={!loadPgc} onChange={() => setLoadPgc(false)} className="mt-0.5" />
              <div>
                <span className="text-[13px] font-medium text-text-primary block">Lo configuraré más tarde</span>
                <span className="text-[11px] text-text-secondary">Podrás cargar cuentas desde Holded o manualmente en Ajustes.</span>
              </div>
            </label>

            {error && <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 h-10 border border-subtle text-[13px] text-text-secondary rounded-md hover:bg-hover">
                Atrás
              </button>
              <button
                onClick={handleComplete}
                disabled={saving}
                className="flex-1 h-10 bg-green text-white text-[13px] font-medium rounded-md hover:bg-green-text disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? "Creando empresa..." : "Completar configuración"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
