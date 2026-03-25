"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, ChevronDown, ChevronRight, X, AlertTriangle } from "lucide-react";

interface CompanyData {
  id: string;
  name: string;
  shortName?: string;
  legalName?: string;
  cif: string;
  consolidationMethod: string;
  ownershipPercentage: number | null;
  functionalCurrency: string;
  isActive: boolean;
  isHoldingCompany: boolean;
  parentCompanyId: string | null;
  parentCompany?: { id: string; name: string } | null;
  subsidiaries?: {
    id: string;
    name: string;
    consolidationMethod: string;
    ownershipPercentage: number | null;
  }[];
  taxJurisdiction: string;
  localGaap: string;
  presentationCurrency?: string | null;
  nciMethod?: string | null;
  acquisitionDate?: string | null;
  fiscalYearEndMonth: number;
  firstConsolidationPeriod?: string | null;
  segment?: string | null;
  geographicRegion?: string | null;
  _count?: { bankTransactions: number; invoices: number; users: number };
}

const METHOD_LABELS: Record<string, string> = {
  FULL: "Integración global",
  EQUITY: "Puesta en equivalencia",
  PROPORTIONAL: "Proporcional",
  NOT_CONSOLIDATED: "No consolida",
};

const METHOD_COLORS: Record<string, string> = {
  FULL: "bg-accent/10 text-accent",
  EQUITY: "bg-amber-100 text-amber-700",
  PROPORTIONAL: "bg-purple-100 text-purple-700",
  NOT_CONSOLIDATED: "bg-gray-100 text-gray-500",
};

const GAAP_OPTIONS = [
  { value: "PGC_PYMES", label: "PGC PYMEs" },
  { value: "PGC_FULL", label: "PGC Completo" },
  { value: "IFRS", label: "IFRS / NIIF" },
  { value: "US_GAAP", label: "US GAAP" },
  { value: "OTHER", label: "Otro" },
];

const CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "MXN",
  "BRL",
  "CLP",
  "COP",
  "ARS",
];

export default function SociedadesPage() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Form state
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    cif: "",
    shortName: "",
    taxJurisdiction: "ES",
    localGaap: "PGC_PYMES",
    functionalCurrency: "EUR",
    presentationCurrency: "",
    parentCompanyId: "",
    consolidationMethod: "FULL",
    ownershipPercentage: 100,
    nciMethod: "",
    acquisitionDate: "",
    fiscalYearEndMonth: 12,
    firstConsolidationPeriod: "",
    segment: "",
    geographicRegion: "",
  });

  const [sections, setSections] = useState({ contabilidad: false, segmentos: false });

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/companies");
      const json = await res.json();
      setCompanies(json.data ?? []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Validate form and set warnings
  useEffect(() => {
    const w: string[] = [];
    const method = form.consolidationMethod;
    const pct = form.ownershipPercentage;

    if (method === "FULL" && pct <= 50) {
      w.push(
        "Integración global normalmente requiere >50% de control. ¿Puedes demostrar control efectivo?"
      );
    }
    if (method === "EQUITY" && (pct < 20 || pct > 50)) {
      w.push("Puesta en equivalencia normalmente aplica con 20-50% de participación.");
    }
    if (method === "FULL" && pct < 100 && !form.nciMethod) {
      w.push(
        "Con participación <100% y método global, debes seleccionar el método de NCI (minoritarios)."
      );
    }
    if (form.functionalCurrency && form.functionalCurrency !== "EUR") {
      w.push("Se aplicará traducción de moneda según IAS 21.");
    }
    setWarnings(w);
  }, [form.consolidationMethod, form.ownershipPercentage, form.nciMethod, form.functionalCurrency]);

  const resetForm = () => {
    setForm({
      name: "",
      legalName: "",
      cif: "",
      shortName: "",
      taxJurisdiction: "ES",
      localGaap: "PGC_PYMES",
      functionalCurrency: "EUR",
      presentationCurrency: "",
      parentCompanyId: "",
      consolidationMethod: "FULL",
      ownershipPercentage: 100,
      nciMethod: "",
      acquisitionDate: "",
      fiscalYearEndMonth: 12,
      firstConsolidationPeriod: "",
      segment: "",
      geographicRegion: "",
    });
    setEditId(null);
    setWarnings([]);
  };

  const openEdit = (c: CompanyData) => {
    setForm({
      name: c.name,
      legalName: c.legalName ?? "",
      cif: c.cif,
      shortName: c.shortName ?? "",
      taxJurisdiction: c.taxJurisdiction ?? "ES",
      localGaap: c.localGaap ?? "PGC_PYMES",
      functionalCurrency: c.functionalCurrency ?? "EUR",
      presentationCurrency: c.presentationCurrency ?? "",
      parentCompanyId: c.parentCompanyId ?? "",
      consolidationMethod: c.consolidationMethod,
      ownershipPercentage: c.ownershipPercentage ?? 100,
      nciMethod: c.nciMethod ?? "",
      acquisitionDate: c.acquisitionDate ? c.acquisitionDate.slice(0, 10) : "",
      fiscalYearEndMonth: c.fiscalYearEndMonth ?? 12,
      firstConsolidationPeriod: c.firstConsolidationPeriod ?? "",
      segment: c.segment ?? "",
      geographicRegion: c.geographicRegion ?? "",
    });
    setEditId(c.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    // Validate CIF
    if (!/^[A-Z]\d{7,8}[A-Z0-9]?$|^\d{8}[A-Z]$/.test(form.cif)) {
      alert("CIF/NIF inválido");
      return;
    }

    setSaving(true);
    try {
      const url = editId ? `/api/settings/companies/${editId}` : "/api/settings/companies";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ownershipPercentage: Number(form.ownershipPercentage),
          fiscalYearEndMonth: Number(form.fiscalYearEndMonth),
          parentCompanyId: form.parentCompanyId || null,
          nciMethod: form.nciMethod || null,
          acquisitionDate: form.acquisitionDate || null,
          presentationCurrency: form.presentationCurrency || null,
          firstConsolidationPeriod: form.firstConsolidationPeriod || null,
          segment: form.segment || null,
          geographicRegion: form.geographicRegion || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al guardar");
        return;
      }

      setShowModal(false);
      resetForm();
      fetchCompanies();
    } catch {
      alert("Error de red");
    } finally {
      setSaving(false);
    }
  };

  const toggleDeactivate = async (c: CompanyData) => {
    const newActive = !c.isActive;
    const reason = !newActive ? prompt("Motivo de desactivación:") : null;
    if (!newActive && reason === null) return; // cancelled

    await fetch(`/api/settings/companies/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: newActive, deactivationReason: reason }),
    });
    fetchCompanies();
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group: holding first, then parents with children
  const holdingCompanies = companies.filter((c) => !c.parentCompanyId);
  const getChildren = (parentId: string) => companies.filter((c) => c.parentCompanyId === parentId);

  if (loading) return <div className="p-8 text-text-secondary">Cargando sociedades...</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Gestión de sociedades</h1>
          <p className="text-sm text-text-secondary mt-1">
            Configura la estructura del grupo para la consolidación contable.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90"
        >
          <Plus size={16} /> Añadir sociedad
        </button>
      </div>

      {/* Company tree */}
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-text-secondary">Sociedad</th>
              <th className="text-left px-3 py-3 font-medium text-text-secondary">CIF</th>
              <th className="text-left px-3 py-3 font-medium text-text-secondary">Método</th>
              <th className="text-right px-3 py-3 font-medium text-text-secondary">%</th>
              <th className="text-center px-3 py-3 font-medium text-text-secondary">Moneda</th>
              <th className="text-center px-3 py-3 font-medium text-text-secondary">Estado</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {holdingCompanies.map((company) => {
              const children = getChildren(company.id);
              const hasChildren = children.length > 0;
              const isExpanded = expanded.has(company.id);

              return (
                <>
                  <tr
                    key={company.id}
                    className="border-b border-border hover:bg-gray-50 cursor-pointer"
                    onClick={() => (hasChildren ? toggleExpand(company.id) : openEdit(company))}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {hasChildren &&
                          (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                        {!hasChildren && <Building2 size={14} className="text-text-tertiary" />}
                        <span className="font-medium">{company.name}</span>
                        {company.isHoldingCompany && (
                          <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                            CABECERA
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-text-secondary">
                      {company.cif}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${METHOD_COLORS[company.consolidationMethod] ?? "bg-gray-100"}`}
                      >
                        {METHOD_LABELS[company.consolidationMethod] ?? company.consolidationMethod}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs">
                      {company.ownershipPercentage != null
                        ? `${company.ownershipPercentage}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-center text-xs">{company.functionalCurrency}</td>
                    <td className="px-3 py-3 text-center">
                      {company.isActive ? (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                          Activa
                        </span>
                      ) : (
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                          Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(company);
                        }}
                        className="text-xs text-accent hover:underline"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                  {isExpanded &&
                    children.map((child) => (
                      <tr
                        key={child.id}
                        className="border-b border-border hover:bg-gray-50 cursor-pointer bg-gray-50/50"
                        onClick={() => openEdit(child)}
                      >
                        <td className="px-4 py-3 pl-10">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-text-tertiary" />
                            <span>{child.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-text-secondary">
                          {child.cif}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${METHOD_COLORS[child.consolidationMethod] ?? "bg-gray-100"}`}
                          >
                            {METHOD_LABELS[child.consolidationMethod] ?? child.consolidationMethod}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {child.ownershipPercentage != null
                            ? `${child.ownershipPercentage}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-center text-xs">
                          {child.functionalCurrency}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {child.isActive ? (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                              Activa
                            </span>
                          ) : (
                            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                              Inactiva
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(child);
                            }}
                            className="text-xs text-accent hover:underline"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                </>
              );
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">
                  No hay sociedades configuradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 mb-16">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">
                {editId ? "Editar sociedad" : "Nueva sociedad"}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Section 1: Datos básicos */}
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3">Datos básicos</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      Nombre comercial *
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      placeholder="Mi Empresa SL"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Razón social *</label>
                    <input
                      value={form.legalName}
                      onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      placeholder="Mi Empresa Sociedad Limitada"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">CIF/NIF *</label>
                    <input
                      value={form.cif}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, cif: e.target.value.toUpperCase() }))
                      }
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono"
                      placeholder="B12345678"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      Jurisdicción fiscal
                    </label>
                    <input
                      value={form.taxJurisdiction}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, taxJurisdiction: e.target.value.toUpperCase() }))
                      }
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      placeholder="ES"
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Estructura de grupo */}
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3">
                  Estructura de grupo
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      Sociedad matriz
                    </label>
                    <select
                      value={form.parentCompanyId}
                      onChange={(e) => setForm((f) => ({ ...f, parentCompanyId: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">— Cabecera (sin matriz) —</option>
                      {companies
                        .filter((c) => c.id !== editId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      Método de consolidación
                    </label>
                    <select
                      value={form.consolidationMethod}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, consolidationMethod: e.target.value }))
                      }
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="FULL">Integración global (&gt;50%)</option>
                      <option value="EQUITY">Puesta en equivalencia (20-50%)</option>
                      <option value="PROPORTIONAL">Proporcional (joint venture)</option>
                      <option value="NOT_CONSOLIDATED">No consolida (&lt;20%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      % participación
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.ownershipPercentage}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ownershipPercentage: Number(e.target.value) }))
                      }
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      Fecha de adquisición
                    </label>
                    <input
                      type="date"
                      value={form.acquisitionDate}
                      onChange={(e) => setForm((f) => ({ ...f, acquisitionDate: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  {form.consolidationMethod === "FULL" && form.ownershipPercentage < 100 && (
                    <div className="col-span-2">
                      <label className="block text-xs text-text-secondary mb-1">
                        Método NCI (minoritarios)
                      </label>
                      <select
                        value={form.nciMethod}
                        onChange={(e) => setForm((f) => ({ ...f, nciMethod: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">Selecciona...</option>
                        <option value="FAIR_VALUE">Valor razonable (full goodwill)</option>
                        <option value="PROPORTIONATE">Parte proporcional (partial goodwill)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Contabilidad (collapsible) */}
              <div>
                <button
                  onClick={() => setSections((s) => ({ ...s, contabilidad: !s.contabilidad }))}
                  className="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
                >
                  {sections.contabilidad ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Contabilidad
                </button>
                {sections.contabilidad && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">
                        Moneda funcional
                      </label>
                      <select
                        value={form.functionalCurrency}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, functionalCurrency: e.target.value }))
                        }
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">
                        Marco contable
                      </label>
                      <select
                        value={form.localGaap}
                        onChange={(e) => setForm((f) => ({ ...f, localGaap: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      >
                        {GAAP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">
                        Mes cierre fiscal
                      </label>
                      <select
                        value={form.fiscalYearEndMonth}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, fiscalYearEndMonth: Number(e.target.value) }))
                        }
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {new Date(2026, i, 1).toLocaleString("es-ES", { month: "long" })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">
                        Primer periodo a consolidar
                      </label>
                      <input
                        type="month"
                        value={form.firstConsolidationPeriod}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, firstConsolidationPeriod: e.target.value }))
                        }
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Segmentos (collapsible, only if >2 companies) */}
              {companies.length > 2 && (
                <div>
                  <button
                    onClick={() => setSections((s) => ({ ...s, segmentos: !s.segmentos }))}
                    className="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
                  >
                    {sections.segmentos ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Segmentos (IFRS 8)
                  </button>
                  {sections.segmentos && (
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">
                          Segmento de negocio
                        </label>
                        <input
                          value={form.segment ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                          placeholder="Alimentación, Distribución..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">
                          Región geográfica
                        </label>
                        <input
                          value={form.geographicRegion ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, geographicRegion: e.target.value }))
                          }
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                          placeholder="España, Europa, Latam..."
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Deactivate button for edit mode */}
              {editId && (
                <div className="border-t border-border pt-4">
                  {(() => {
                    const c = companies.find((x) => x.id === editId);
                    if (!c) return null;
                    return (
                      <button
                        onClick={() => {
                          toggleDeactivate(c);
                          setShowModal(false);
                        }}
                        className={`text-xs ${c.isActive ? "text-red-600 hover:text-red-800" : "text-green-600 hover:text-green-800"}`}
                      >
                        {c.isActive ? "Desactivar sociedad" : "Reactivar sociedad"}
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !form.name || !form.cif}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 disabled:opacity-50"
              >
                {saving ? "Guardando..." : editId ? "Guardar cambios" : "Crear sociedad"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
