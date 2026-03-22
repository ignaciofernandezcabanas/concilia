"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/components/AuthProvider";
import {
  Building2,
  Landmark,
  BookOpen,
  ArrowRight,
  Check,
  Plus,
  X,
  Building,
  Users,
} from "lucide-react";

type Mode = "standalone" | "group";
type Step = 0 | 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshContext } = useAuth();

  // ?add=true → adding company to existing org (skip mode selection)
  const isAddMode = searchParams.get("add") === "true";

  const [step, setStep] = useState<Step>(isAddMode ? 1 : 0);
  const [mode, setMode] = useState<Mode>("standalone");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 0 (group only): Org name
  const [orgName, setOrgName] = useState("");

  // Step 1: Company
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
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
    setAccounts((prev) => prev.map((a, j) => (j === i ? { ...a, [field]: value } : a)));
  }

  function selectMode(m: Mode) {
    setMode(m);
    setStep(1);
  }

  async function handleComplete() {
    setSaving(true);
    setError("");
    try {
      if (isAddMode) {
        // Add company to existing org
        await api.post("/api/onboarding/add-company", {
          company: { name, shortName: shortName || undefined, cif, currency },
          bankAccounts: accounts.filter((a) => a.iban.trim()),
          loadPgc,
        });
      } else {
        // New onboarding: create org + company
        await api.post("/api/onboarding", {
          mode,
          orgName: mode === "group" ? orgName : undefined,
          company: { name, shortName: shortName || undefined, cif, currency },
          bankAccounts: accounts.filter((a) => a.iban.trim()),
          loadPgc,
        });
      }
      refreshContext();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la empresa");
    } finally {
      setSaving(false);
    }
  }

  const cifRegex = /^[A-HJNP-SUVW]\d{7}[0-9A-J]$|^\d{8}[A-Z]$|^[XYZ]\d{7}[A-Z]$/;
  const cifValid = cifRegex.test(cif.trim().toUpperCase());
  const canAdvance1 = name.trim().length > 0 && cifValid && (mode !== "group" || isAddMode || orgName.trim().length > 0);
  const canAdvance2 = accounts.some((a) => a.iban.trim().length > 0);

  const totalSteps = isAddMode ? 3 : (mode === "group" ? 4 : 3);
  const stepLabels = isAddMode
    ? ["Empresa", "Cuentas", "Plan contable"]
    : mode === "group"
      ? ["Tipo", "Grupo + Empresa", "Cuentas", "Plan contable"]
      : ["Tipo", "Empresa", "Cuentas", "Plan contable"];

  // Map internal step to display step
  const displayStep = isAddMode ? step : step + 1;

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-8">
      <div className="bg-white rounded-xl border border-subtle shadow-sm w-full max-w-lg p-8">
        {/* Progress */}
        {step > 0 && (
          <div className="flex items-center gap-2 mb-8">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold ${
                    displayStep > s
                      ? "bg-green text-white"
                      : displayStep === s
                        ? "bg-accent text-white"
                        : "bg-hover text-text-tertiary"
                  }`}
                >
                  {displayStep > s ? <Check size={12} /> : s}
                </div>
                <span className={`text-[11px] hidden sm:inline ${displayStep >= s ? "text-text-primary" : "text-text-tertiary"}`}>
                  {stepLabels[s - 1]}
                </span>
                {s < totalSteps && <div className={`flex-1 h-px ${displayStep > s ? "bg-green" : "bg-subtle"}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step 0: Mode selection (only for new users) */}
        {step === 0 && !isAddMode && (
          <div className="flex flex-col gap-5">
            <div className="text-center mb-4">
              <h1 className="text-[20px] font-semibold text-text-primary mb-1">Bienvenido a Concilia</h1>
              <p className="text-[13px] text-text-secondary">¿Cómo quieres configurar tu cuenta?</p>
            </div>

            <button
              onClick={() => selectMode("standalone")}
              className="flex items-start gap-4 p-5 border border-subtle rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20">
                <Building size={20} className="text-accent" />
              </div>
              <div>
                <span className="text-[14px] font-semibold text-text-primary block">Empresa individual</span>
                <span className="text-[12px] text-text-secondary mt-0.5 block">
                  Una sola sociedad. Ideal para autónomos y PYMEs con una única entidad legal.
                </span>
              </div>
            </button>

            <button
              onClick={() => selectMode("group")}
              className="flex items-start gap-4 p-5 border border-subtle rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20">
                <Users size={20} className="text-accent" />
              </div>
              <div>
                <span className="text-[14px] font-semibold text-text-primary block">Grupo de empresas</span>
                <span className="text-[12px] text-text-secondary mt-0.5 block">
                  Varias sociedades bajo una misma organización. Vista consolidada, detección intercompañía.
                </span>
              </div>
            </button>
          </div>
        )}

        {/* Step 1: Company data */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 mb-2">
              <Building2 size={24} className="text-accent" />
              <div>
                <h1 className="text-[18px] font-semibold text-text-primary">
                  {isAddMode ? "Añadir sociedad" : "Datos de la empresa"}
                </h1>
                <p className="text-[12px] text-text-secondary">
                  {isAddMode
                    ? "Añade una nueva sociedad a tu organización."
                    : "Configura tu empresa para empezar a conciliar."}
                </p>
              </div>
            </div>

            {/* Org name — only for group mode on first onboarding */}
            {mode === "group" && !isAddMode && (
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Nombre del grupo / organización</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Grupo Empresarial XYZ"
                  className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md focus:border-accent focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Nombre de la empresa</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mi Empresa S.L."
                className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md focus:border-accent focus:outline-none"
              />
            </div>

            {/* Short name — useful for groups */}
            {(mode === "group" || isAddMode) && (
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Nombre corto (opcional)</label>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="MiEmpresa"
                  className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md focus:border-accent focus:outline-none"
                />
                <p className="text-[10px] text-text-tertiary mt-1">Se muestra en el selector de empresas</p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">CIF / NIF</label>
              <input
                type="text"
                value={cif}
                onChange={(e) => setCif(e.target.value.toUpperCase())}
                placeholder="B12345678"
                className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md focus:border-accent focus:outline-none"
              />
              {cif.trim().length > 0 && !cifValid && (
                <p className="text-[11px] text-red-text mt-1">CIF/NIF inválido. Formato: B12345670, 12345678Z, o X1234567A</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-10 px-3 text-[13px] border border-subtle rounded-md"
              >
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — Dólar</option>
                <option value="GBP">GBP — Libra</option>
              </select>
            </div>

            <div className="flex gap-2">
              {!isAddMode && (
                <button
                  onClick={() => setStep(0)}
                  className="flex-1 h-10 border border-subtle text-[13px] text-text-secondary rounded-md hover:bg-hover"
                >
                  Atrás
                </button>
              )}
              <button
                onClick={() => setStep(2)}
                disabled={!canAdvance1}
                className={`${isAddMode ? "w-full" : "flex-1"} h-10 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent-dark disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                Siguiente <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Bank accounts */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 mb-2">
              <Landmark size={24} className="text-accent" />
              <div>
                <h1 className="text-[18px] font-semibold text-text-primary">Cuentas bancarias</h1>
                <p className="text-[12px] text-text-secondary">
                  Añade los IBANs de tus cuentas propias. Se usan para detectar transferencias internas.
                </p>
              </div>
            </div>

            {accounts.map((acc, i) => (
              <div key={i} className="flex flex-col gap-2 p-3 bg-page rounded-md border border-border-light">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-text-secondary">Cuenta {i + 1}</span>
                  {accounts.length > 1 && (
                    <button onClick={() => removeAccount(i)} className="text-text-tertiary hover:text-red">
                      <X size={14} />
                    </button>
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
              <button
                onClick={() => setStep(1)}
                className="flex-1 h-10 border border-subtle text-[13px] text-text-secondary rounded-md hover:bg-hover"
              >
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
                <p className="text-[12px] text-text-secondary">
                  El plan contable se usa para clasificar transacciones y generar reportes.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-3 p-4 border border-subtle rounded-lg cursor-pointer hover:bg-page">
              <input type="radio" checked={loadPgc} onChange={() => setLoadPgc(true)} className="mt-0.5" />
              <div>
                <span className="text-[13px] font-medium text-text-primary block">Cargar PGC estándar para PYMEs</span>
                <span className="text-[11px] text-text-secondary">
                  Incluye ~50 cuentas más comunes del Plan General Contable español. Recomendado.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 border border-subtle rounded-lg cursor-pointer hover:bg-page">
              <input type="radio" checked={!loadPgc} onChange={() => setLoadPgc(false)} className="mt-0.5" />
              <div>
                <span className="text-[13px] font-medium text-text-primary block">Lo configuraré más tarde</span>
                <span className="text-[11px] text-text-secondary">
                  Podrás cargar cuentas desde Holded o manualmente en Ajustes.
                </span>
              </div>
            </label>

            {error && <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 h-10 border border-subtle text-[13px] text-text-secondary rounded-md hover:bg-hover"
              >
                Atrás
              </button>
              <button
                onClick={handleComplete}
                disabled={saving}
                className="flex-1 h-10 bg-green text-white text-[13px] font-medium rounded-md hover:bg-green-text disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving
                  ? isAddMode
                    ? "Añadiendo sociedad..."
                    : "Creando empresa..."
                  : isAddMode
                    ? "Añadir sociedad"
                    : "Completar configuración"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
