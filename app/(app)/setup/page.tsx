"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getSupabase } from "@/lib/api-client";
import TopBar from "@/components/TopBar";
import {
  Building2,
  Briefcase,
  CreditCard,
  Sparkles,
  FileUp,
  BarChart3,
  Link2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Check,
  X,
  Upload,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEPS = [
  { label: "Empresa", icon: Building2 },
  { label: "Actividad", icon: Briefcase },
  { label: "Cobro e IVA", icon: CreditCard },
  { label: "Plan inferido", icon: Sparkles },
  { label: "Datos hist\u00f3ricos", icon: FileUp },
  { label: "Calibraci\u00f3n", icon: BarChart3 },
  { label: "Integraciones", icon: Link2 },
  { label: "Resumen", icon: CheckCircle2 },
];

interface InferenceResult {
  subplan: { code: string; name: string; status: string; confidence: number; reason: string }[];
  fiscal_modules: {
    model: string;
    name: string;
    periodicity: string;
    active: boolean;
    legal_basis: string;
  }[];
  default_counterparts: { concept: string; debit_account: string; credit_account: string }[];
  warnings: string[];
  summary: string;
}

interface CalibrationResult {
  accounts_confirmed: { code: string; name: string }[];
  accounts_added: { code: string; name: string; reason: string }[];
  accounts_inactive: { code: string; name: string; reason: string }[];
  anomalies: { code: string; message: string; severity: string }[];
  recurring_patterns: {
    concept: string;
    counterpart: string;
    frequency: number;
    avg_amount: number;
    confidence: number;
  }[];
  calibration_summary: string;
}

export default function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Empresa
  const [empresa, setEmpresa] = useState("");
  const [nif, setNif] = useState("");
  const [formaJuridica, setFormaJuridica] = useState("SL");

  // Step 2: Actividad
  const [sector, setSector] = useState("");
  const [actividad, setActividad] = useState("");
  const [canales, setCanales] = useState<string[]>([]);

  // Step 3: Cobro e IVA
  const [regimenIva, setRegimenIva] = useState("general");
  const [irpfRetenciones, setIrpfRetenciones] = useState(false);
  const [cobro, setCobro] = useState("transferencia");

  // Step 4: Inference result
  const [inference, setInference] = useState<InferenceResult | null>(null);

  // Step 5: Files
  const [files, setFiles] = useState<File[]>([]);

  // Step 6: Calibration result
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [skippedHistorical, setSkippedHistorical] = useState(false);

  const toggleCanal = (canal: string) => {
    setCanales((prev) =>
      prev.includes(canal) ? prev.filter((c) => c !== canal) : [...prev, canal]
    );
  };

  const runInference = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ inference: InferenceResult }>(
        "/api/setup/business-profile/infer",
        {
          empresa,
          nif,
          forma_juridica: formaJuridica,
          sector,
          regimen_iva: regimenIva,
          irpf_retenciones: irpfRetenciones,
          actividad,
          canales,
          cobro,
        }
      );
      setInference(res.inference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al inferir plan de cuentas");
    } finally {
      setLoading(false);
    }
  }, [empresa, nif, formaJuridica, sector, regimenIva, irpfRetenciones, actividad, canales, cobro]);

  const runCalibration = useCallback(async () => {
    if (!files.length) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const sb = getSupabase();
      const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
      const resp = await fetch("/api/setup/historical/process", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(body.error || "Error al procesar archivos");
      }
      const res = await resp.json();
      setCalibration(res.calibration);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al calibrar");
    } finally {
      setLoading(false);
    }
  }, [files]);

  const goNext = async () => {
    setError("");
    if (step === 3) {
      // Entering step 4 → run inference
      setStep(4);
      await runInference();
      return;
    }
    if (step === 5) {
      if (files.length === 0) {
        setSkippedHistorical(true);
        setStep(7); // Skip calibration
        return;
      }
      setStep(6);
      await runCalibration();
      return;
    }
    if (step < 8) {
      setStep((step + 1) as Step);
    }
  };

  const goBack = () => {
    if (step === 7 && skippedHistorical) {
      setStep(5);
      return;
    }
    if (step > 1) setStep((step - 1) as Step);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return empresa.trim() !== "" && nif.trim() !== "";
      case 2:
        return sector.trim() !== "" && actividad.trim() !== "" && canales.length > 0;
      case 3:
        return true;
      case 4:
        return inference !== null;
      case 5:
        return true; // Can skip
      case 6:
        return calibration !== null;
      case 7:
        return true;
      case 8:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Configuraci\u00f3n inicial" />
      <div className="flex flex-col gap-6 p-6 px-8 flex-1 overflow-auto max-w-3xl mx-auto w-full">
        {/* Progress bar */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i + 1 === step;
            const isDone = i + 1 < step;
            return (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    isActive
                      ? "bg-accent/10 text-accent"
                      : isDone
                        ? "text-green-text"
                        : "text-text-tertiary"
                  }`}
                >
                  {isDone ? <Check size={12} /> : <Icon size={12} />}
                  <span className="hidden lg:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${isDone ? "bg-green" : "bg-border-light"}`} />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="bg-red/5 border border-red/30 rounded-lg p-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red shrink-0" />
            <p className="text-[13px] text-red-text">{error}</p>
          </div>
        )}

        {/* Steps */}
        <div className="bg-white rounded-lg border border-subtle p-6">
          {step === 1 && (
            <StepSection
              title="Datos de la empresa"
              description="Informaci\u00f3n b\u00e1sica de tu empresa."
            >
              <Field
                label="Nombre de la empresa"
                value={empresa}
                onChange={setEmpresa}
                placeholder="Mi Empresa S.L."
              />
              <Field label="NIF/CIF" value={nif} onChange={setNif} placeholder="B12345678" />
              <SelectField
                label="Forma jur\u00eddica"
                value={formaJuridica}
                onChange={setFormaJuridica}
                options={[
                  { value: "SL", label: "Sociedad Limitada (S.L.)" },
                  { value: "SA", label: "Sociedad An\u00f3nima (S.A.)" },
                  { value: "autonomo", label: "Aut\u00f3nomo" },
                  { value: "cooperativa", label: "Cooperativa" },
                  { value: "asociacion", label: "Asociaci\u00f3n" },
                  { value: "otra", label: "Otra" },
                ]}
              />
            </StepSection>
          )}

          {step === 2 && (
            <StepSection
              title="Actividad empresarial"
              description="Describe qu\u00e9 hace tu empresa para inferir el plan de cuentas \u00f3ptimo."
            >
              <SelectField
                label="Sector"
                value={sector}
                onChange={setSector}
                options={[
                  { value: "comercio", label: "Comercio / Distribuci\u00f3n" },
                  { value: "servicios", label: "Servicios profesionales" },
                  { value: "tecnologia", label: "Tecnolog\u00eda / SaaS" },
                  { value: "construccion", label: "Construcci\u00f3n" },
                  { value: "hosteleria", label: "Hosteler\u00eda / Restauraci\u00f3n" },
                  { value: "industria", label: "Industria / Manufactura" },
                  { value: "inmobiliaria", label: "Inmobiliaria" },
                  { value: "salud", label: "Salud / Sanitario" },
                  { value: "educacion", label: "Educaci\u00f3n" },
                  { value: "transporte", label: "Transporte / Log\u00edstica" },
                  { value: "otro", label: "Otro" },
                ]}
              />
              <Field
                label="Descripci\u00f3n de la actividad"
                value={actividad}
                onChange={setActividad}
                placeholder="Ej: Venta online de productos electr\u00f3nicos, desarrollo de software a medida..."
                multiline
              />
              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-2">
                  Canales de venta / ingresos
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Online",
                    "Tienda f\u00edsica",
                    "B2B directo",
                    "Marketplace",
                    "Franquicia",
                    "Exportaci\u00f3n",
                    "Suscripci\u00f3n",
                  ].map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleCanal(c)}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
                        canales.includes(c)
                          ? "bg-accent/10 border-accent/30 text-accent"
                          : "bg-page border-subtle text-text-secondary hover:border-accent/20"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </StepSection>
          )}

          {step === 3 && (
            <StepSection
              title="Cobro y fiscalidad"
              description="Configuraci\u00f3n fiscal para determinar los m\u00f3dulos aplicables."
            >
              <SelectField
                label="R\u00e9gimen de IVA"
                value={regimenIva}
                onChange={setRegimenIva}
                options={[
                  { value: "general", label: "R\u00e9gimen General" },
                  { value: "simplificado", label: "R\u00e9gimen Simplificado" },
                  { value: "recargo", label: "Recargo de Equivalencia" },
                  { value: "exento", label: "Exento / No sujeto" },
                  { value: "criterio_caja", label: "Criterio de Caja" },
                ]}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIrpfRetenciones(!irpfRetenciones)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    irpfRetenciones ? "bg-accent" : "bg-border"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${
                      irpfRetenciones ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="text-[13px] text-text-primary">Practico retenciones de IRPF</span>
              </div>
              <SelectField
                label="Forma habitual de cobro"
                value={cobro}
                onChange={setCobro}
                options={[
                  { value: "transferencia", label: "Transferencia bancaria" },
                  { value: "tarjeta", label: "TPV / Tarjeta" },
                  { value: "domiciliacion", label: "Domiciliaci\u00f3n bancaria" },
                  { value: "mixto", label: "Mixto" },
                  { value: "efectivo", label: "Efectivo" },
                ]}
              />
            </StepSection>
          )}

          {step === 4 && (
            <StepSection
              title="Plan de cuentas inferido"
              description="Concilia ha analizado tu perfil y propone este plan PGC."
            >
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3">
                  <Loader2 size={20} className="animate-spin text-accent" />
                  <span className="text-[13px] text-text-secondary">
                    Analizando perfil empresarial...
                  </span>
                </div>
              ) : inference ? (
                <div className="space-y-4">
                  <p className="text-[13px] text-text-secondary">{inference.summary}</p>

                  {inference.warnings.length > 0 && (
                    <div className="bg-amber/5 border border-amber/30 rounded-lg p-3">
                      {inference.warnings.map((w, i) => (
                        <p key={i} className="text-[12px] text-amber flex items-start gap-1.5">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                  <div>
                    <h4 className="text-[12px] font-semibold text-text-tertiary uppercase mb-2">
                      Cuentas ({inference.subplan.filter((a) => a.status === "active").length}{" "}
                      activas)
                    </h4>
                    <div className="max-h-48 overflow-y-auto border border-subtle rounded-md divide-y divide-border-light">
                      {inference.subplan
                        .filter((a) => a.status === "active")
                        .slice(0, 30)
                        .map((a, i) => (
                          <div key={i} className="flex items-center px-3 py-1.5 text-[12px]">
                            <span className="font-mono text-accent w-14">{a.code}</span>
                            <span className="flex-1 text-text-primary">{a.name}</span>
                            <span className="text-text-tertiary">
                              {Math.round(a.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[12px] font-semibold text-text-tertiary uppercase mb-2">
                      M\u00f3dulos fiscales
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {inference.fiscal_modules.map((m, i) => (
                        <span
                          key={i}
                          className={`px-2 py-1 rounded text-[11px] font-medium ${
                            m.active ? "bg-green/10 text-green-text" : "bg-page text-text-tertiary"
                          }`}
                        >
                          {m.model} — {m.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[12px] font-semibold text-text-tertiary uppercase mb-2">
                      Contrapartidas por defecto
                    </h4>
                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      {inference.default_counterparts.slice(0, 8).map((c, i) => (
                        <div key={i} className="bg-page rounded px-2 py-1">
                          <span className="text-text-secondary">{c.concept}:</span>{" "}
                          <span className="font-mono text-accent">
                            {c.debit_account}/{c.credit_account}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-text-tertiary py-8 text-center">
                  No se pudo generar la inferencia. Pulsa &quot;Reintentar&quot; o vuelve
                  atr\u00e1s.
                </p>
              )}
            </StepSection>
          )}

          {step === 5 && (
            <StepSection
              title="Datos hist\u00f3ricos (opcional)"
              description="Sube archivos contables (balances, libros diarios, exports de Holded/Sage/A3) para calibrar el plan con datos reales."
            >
              <div
                className="border-2 border-dashed border-subtle rounded-lg p-8 text-center hover:border-accent/30 transition-colors cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = Array.from(e.dataTransfer.files);
                  setFiles((prev) => [...prev, ...dropped]);
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.multiple = true;
                  input.accept = ".csv,.xlsx,.xls,.txt";
                  input.onchange = () => {
                    if (input.files) setFiles((prev) => [...prev, ...Array.from(input.files!)]);
                  };
                  input.click();
                }}
              >
                <Upload size={24} className="mx-auto text-text-tertiary mb-2" />
                <p className="text-[13px] text-text-secondary">
                  Arrastra archivos aqu\u00ed o haz clic para seleccionar
                </p>
                <p className="text-[11px] text-text-tertiary mt-1">CSV, Excel, TXT</p>
              </div>

              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-page rounded px-3 py-1.5">
                      <FileUp size={14} className="text-accent" />
                      <span className="text-[12px] text-text-primary flex-1">{f.name}</span>
                      <span className="text-[11px] text-text-tertiary">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        <X size={14} className="text-text-tertiary hover:text-red" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-text-tertiary">
                Este paso es opcional. Si no tienes archivos, pulsa &quot;Siguiente&quot; para
                saltar.
              </p>
            </StepSection>
          )}

          {step === 6 && (
            <StepSection
              title="Calibraci\u00f3n"
              description="Comparando plan inferido con tus datos hist\u00f3ricos."
            >
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3">
                  <Loader2 size={20} className="animate-spin text-accent" />
                  <span className="text-[13px] text-text-secondary">
                    Procesando archivos y calibrando...
                  </span>
                </div>
              ) : calibration ? (
                <div className="space-y-4">
                  <p className="text-[13px] text-text-secondary">
                    {calibration.calibration_summary}
                  </p>

                  {calibration.anomalies.length > 0 && (
                    <div className="space-y-1">
                      <h4 className="text-[12px] font-semibold text-text-tertiary uppercase">
                        Anomal\u00edas detectadas
                      </h4>
                      {calibration.anomalies.map((a, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 rounded px-3 py-2 text-[12px] ${
                            a.severity === "critical"
                              ? "bg-red/5 text-red-text"
                              : a.severity === "warning"
                                ? "bg-amber/5 text-amber"
                                : "bg-page text-text-secondary"
                          }`}
                        >
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          <span>
                            <span className="font-mono font-medium">{a.code}</span> — {a.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-green/5 rounded-lg p-3">
                      <span className="text-[20px] font-semibold text-green-text">
                        {calibration.accounts_confirmed.length}
                      </span>
                      <p className="text-[11px] text-text-tertiary">Confirmadas</p>
                    </div>
                    <div className="bg-accent/5 rounded-lg p-3">
                      <span className="text-[20px] font-semibold text-accent">
                        {calibration.accounts_added.length}
                      </span>
                      <p className="text-[11px] text-text-tertiary">A\u00f1adidas</p>
                    </div>
                    <div className="bg-page rounded-lg p-3">
                      <span className="text-[20px] font-semibold text-text-tertiary">
                        {calibration.accounts_inactive.length}
                      </span>
                      <p className="text-[11px] text-text-tertiary">Inactivas</p>
                    </div>
                  </div>

                  {calibration.recurring_patterns.length > 0 && (
                    <div>
                      <h4 className="text-[12px] font-semibold text-text-tertiary uppercase mb-2">
                        Patrones recurrentes detectados
                      </h4>
                      <div className="space-y-1">
                        {calibration.recurring_patterns.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center bg-page rounded px-3 py-1.5 text-[12px]"
                          >
                            <span className="flex-1 text-text-primary">{p.concept}</span>
                            <span className="text-text-tertiary">{p.frequency}x</span>
                            <span className="ml-3 font-mono text-text-secondary">
                              ~{p.avg_amount.toFixed(0)}\u20ac
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-text-tertiary py-8 text-center">
                  No se pudo calibrar. Vuelve atr\u00e1s e intenta con otros archivos.
                </p>
              )}
            </StepSection>
          )}

          {step === 7 && (
            <StepSection
              title="Integraciones"
              description="Conecta tus herramientas para automatizar la conciliaci\u00f3n."
            >
              <div className="space-y-3">
                <IntegrationLink
                  name="Holded"
                  description="Sincroniza facturas y contactos autom\u00e1ticamente"
                  href="/ajustes"
                />
                <IntegrationLink
                  name="Google Drive"
                  description="Almacena documentos de soporte"
                  href="/ajustes"
                />
                <IntegrationLink
                  name="Gmail / Outlook"
                  description="Importa facturas del correo"
                  href="/ajustes"
                />
              </div>
              <p className="text-[11px] text-text-tertiary mt-2">
                Puedes configurar las integraciones m\u00e1s tarde desde Ajustes.
              </p>
            </StepSection>
          )}

          {step === 8 && (
            <StepSection
              title="Todo listo"
              description="Tu empresa est\u00e1 configurada. Concilia adaptar\u00e1 el plan de cuentas y las reglas autom\u00e1ticamente con el uso."
            >
              <div className="space-y-3 py-4">
                <SummaryItem label="Empresa" value={empresa} />
                <SummaryItem label="Sector" value={sector} />
                <SummaryItem label="Actividad" value={actividad} />
                <SummaryItem label="R\u00e9gimen IVA" value={regimenIva} />
                {inference && (
                  <SummaryItem
                    label="Cuentas activas"
                    value={`${inference.subplan.filter((a) => a.status === "active").length} cuentas PGC`}
                  />
                )}
                {calibration && (
                  <SummaryItem
                    label="Calibraci\u00f3n"
                    value={`${calibration.accounts_confirmed.length} confirmadas, ${calibration.accounts_added.length} a\u00f1adidas`}
                  />
                )}
              </div>
            </StepSection>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft size={14} />
              Atr\u00e1s
            </button>
          ) : (
            <div />
          )}

          {step === 8 ? (
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 bg-accent text-white px-5 py-2 rounded-md text-[13px] font-medium hover:bg-accent/90 transition-colors"
            >
              Empezar
              <ArrowRight size={14} />
            </button>
          ) : step === 4 && !inference && !loading ? (
            <button
              onClick={runInference}
              className="flex items-center gap-2 bg-accent text-white px-5 py-2 rounded-md text-[13px] font-medium hover:bg-accent/90 transition-colors"
            >
              Reintentar
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canProceed() || loading}
              className="flex items-center gap-2 bg-accent text-white px-5 py-2 rounded-md text-[13px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  {step === 5 && files.length === 0 ? "Saltar" : "Siguiente"}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-text-primary">{title}</h2>
        <p className="text-[13px] text-text-tertiary mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls =
    "w-full border border-subtle rounded-md px-3 py-2 text-[13px] text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-accent/40";
  return (
    <div>
      <label className="block text-[13px] font-medium text-text-secondary mb-1.5">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cls}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-text-secondary mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-subtle rounded-md px-3 py-2 text-[13px] text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-accent/40"
      >
        <option value="">Selecciona...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function IntegrationLink({
  name,
  description,
  href,
}: {
  name: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 bg-page rounded-lg p-3 border border-subtle hover:border-accent/30 transition-colors"
    >
      <Link2 size={16} className="text-accent shrink-0" />
      <div className="flex-1">
        <span className="text-[13px] font-medium text-text-primary block">{name}</span>
        <span className="text-[11px] text-text-tertiary">{description}</span>
      </div>
      <ArrowRight size={14} className="text-text-tertiary" />
    </a>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border-light last:border-0">
      <span className="text-[12px] text-text-tertiary">{label}</span>
      <span className="text-[13px] font-medium text-text-primary">{value}</span>
    </div>
  );
}
