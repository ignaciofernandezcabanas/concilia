"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { formatAmount, formatDate } from "@/lib/format";
import Badge from "@/components/Badge";
import Toast from "@/components/Toast";
import {
  Search,
  Plus,
  Users,
  Building2,
  ArrowRight,
  X,
  Sparkles,
  Upload,
  GitMerge,
} from "lucide-react";

// ── Types ──

interface ContactListItem {
  id: string;
  name: string;
  cif: string | null;
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  email: string | null;
  latePaymentRisk: string | null;
  enrichmentConfidence: string | null;
  _count: { invoices: number };
}

interface ContactInvoice {
  id: string;
  number: string;
  type: string;
  issueDate: string;
  totalAmount: number;
  status: string;
}

interface ContactPerson {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  isDefault: boolean;
}

interface ContactDetail {
  id: string;
  name: string;
  cif: string | null;
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  email: string | null;
  iban: string | null;
  accountingEmail: string | null;
  accountingContact: string | null;
  paymentTermsDays: number | null;
  preferredLanguage: string | null;
  typicalAmountAvg: number | null;
  irpfApplicable: boolean | null;
  irpfRateImplied: number | null;
  avgPaymentDays: number | null;
  latePaymentRisk: string | null;
  enrichedAt: string | null;
  enrichmentConfidence: string | null;
  invoices: ContactInvoice[];
  people?: ContactPerson[];
  _count: { invoices: number; inquiries: number; recurringAccruals: number };
}

interface PaginatedContacts {
  data: ContactListItem[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

// ── Constants ──

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  CUSTOMER: { label: "Cliente", className: "bg-green-100 text-green-700" },
  SUPPLIER: { label: "Proveedor", className: "bg-blue-100 text-blue-700" },
  BOTH: { label: "Ambos", className: "bg-purple-100 text-purple-700" },
};

const RISK_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: "Bajo riesgo", className: "bg-green-100 text-green-700" },
  medium: { label: "Riesgo medio", className: "bg-amber-100 text-amber-700" },
  high: { label: "Alto riesgo", className: "bg-red-100 text-red-700" },
};

const CONFIDENCE_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: "Conf. alta", className: "bg-green-50 text-green-600" },
  medium: { label: "Conf. media", className: "bg-amber-50 text-amber-600" },
  low: { label: "Conf. baja", className: "bg-gray-100 text-gray-500" },
};

type FilterKey = "all" | "CUSTOMER" | "SUPPLIER";

// ── ContactRow ──

function ContactRow({
  contact,
  selected,
  onClick,
}: {
  contact: ContactListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const typeCfg = TYPE_BADGE[contact.type] ?? TYPE_BADGE.CUSTOMER;
  const risk = contact.latePaymentRisk ? RISK_BADGE[contact.latePaymentRisk] : null;

  return (
    <tr
      className={`cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 ${
        selected ? "bg-blue-50/60" : ""
      }`}
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-gray-900">{contact.name}</div>
        {contact.cif && <div className="text-xs text-gray-400">{contact.cif}</div>}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeCfg.className}`}>
          {typeCfg.label}
        </span>
      </td>
      <td
        className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate"
        title={contact.email ?? undefined}
      >
        {contact.email ?? "—"}
      </td>
      <td className="px-4 py-3">
        {risk ? (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${risk.className}`}>
            {risk.label}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 text-right">{contact._count.invoices}</td>
    </tr>
  );
}

// ── ContactDetailPanel ──

function ContactDetailPanel({
  contact,
  onEdit,
  onEnrich,
  onPeopleChange,
}: {
  contact: ContactDetail;
  onEdit: () => void;
  onEnrich: () => void;
  onPeopleChange: () => void;
}) {
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [newPersonRole, setNewPersonRole] = useState("");

  async function addPerson() {
    if (!newPersonName.trim() || !newPersonEmail.trim()) return;
    try {
      await api.post(`/api/contacts/${contact.id}/people`, {
        name: newPersonName.trim(),
        email: newPersonEmail.trim(),
        role: newPersonRole.trim() || null,
      });
      setNewPersonName("");
      setNewPersonEmail("");
      setNewPersonRole("");
      setShowAddPerson(false);
      onPeopleChange();
    } catch {
      // handled by api client
    }
  }

  async function setDefaultPerson(personId: string) {
    try {
      await api.post(`/api/contacts/${contact.id}/people/${personId}/set-default`);
      onPeopleChange();
    } catch {
      // handled by api client
    }
  }

  const typeCfg = TYPE_BADGE[contact.type] ?? TYPE_BADGE.CUSTOMER;
  const risk = contact.latePaymentRisk ? RISK_BADGE[contact.latePaymentRisk] : null;
  const conf = contact.enrichmentConfidence ? CONFIDENCE_BADGE[contact.enrichmentConfidence] : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeCfg.className}`}>
            {typeCfg.label}
          </span>
          {risk && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${risk.className}`}>
              {risk.label}
            </span>
          )}
          {conf && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${conf.className}`}>
              {conf.label}
            </span>
          )}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{contact.name}</h2>
        {contact.cif && <p className="text-sm text-gray-500 mt-0.5">{contact.cif}</p>}
      </div>

      {/* Contact info */}
      <div className="p-5 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Datos de contacto
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-400 text-xs">Email</span>
            <p className="text-gray-800">{contact.email ?? "—"}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Email contable</span>
            <p className="text-gray-800">{contact.accountingEmail ?? "—"}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Contacto contable</span>
            <p className="text-gray-800">{contact.accountingContact ?? "—"}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">IBAN</span>
            <p className="text-gray-800 font-mono text-xs">{contact.iban ?? "—"}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Idioma</span>
            <p className="text-gray-800">
              {contact.preferredLanguage === "es"
                ? "Espanol"
                : contact.preferredLanguage === "en"
                  ? "English"
                  : contact.preferredLanguage === "ca"
                    ? "Catala"
                    : (contact.preferredLanguage ?? "—")}
            </p>
          </div>
        </div>
      </div>

      {/* Financial info */}
      <div className="p-5 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Informacion financiera
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-400 text-xs">Plazo pago</span>
            <p className="text-gray-800">
              {contact.paymentTermsDays != null ? `${contact.paymentTermsDays} dias` : "—"}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Importe medio</span>
            <p className="text-gray-800">
              {contact.typicalAmountAvg != null ? formatAmount(contact.typicalAmountAvg) : "—"}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">IRPF aplicable</span>
            <p className="text-gray-800">
              {contact.irpfApplicable != null ? (contact.irpfApplicable ? "Si" : "No") : "—"}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Tipo IRPF implicito</span>
            <p className="text-gray-800">
              {contact.irpfRateImplied != null
                ? `${(contact.irpfRateImplied * 100).toFixed(0)}%`
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Media dias pago</span>
            <p className="text-gray-800">
              {contact.avgPaymentDays != null ? `${contact.avgPaymentDays.toFixed(0)} dias` : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Personas de contacto */}
      <div className="p-5 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Personas de contacto
          </h3>
          <button
            onClick={() => setShowAddPerson(true)}
            className="text-xs text-accent hover:underline"
          >
            + Anadir
          </button>
        </div>

        {contact.people?.map((person) => (
          <div
            key={person.id}
            className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0"
          >
            <div>
              <div className="flex items-center gap-1.5">
                {person.isDefault && (
                  <span className="text-amber-500" title="Contacto para seguimiento">
                    *
                  </span>
                )}
                <span className="text-sm font-medium">{person.name}</span>
                {person.role && <span className="text-[10px] text-gray-400">{person.role}</span>}
              </div>
              <p className="text-xs text-gray-500">
                {person.email}
                {person.phone ? ` · ${person.phone}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!person.isDefault && (
                <button
                  onClick={() => setDefaultPerson(person.id)}
                  className="text-[10px] text-accent hover:underline"
                >
                  Seguimiento
                </button>
              )}
            </div>
          </div>
        ))}

        {(!contact.people || contact.people.length === 0) && !showAddPerson && (
          <p className="text-sm text-gray-400">Sin personas</p>
        )}

        {showAddPerson && (
          <div className="mt-2 space-y-1.5">
            <input
              placeholder="Nombre"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1"
            />
            <input
              placeholder="Email"
              value={newPersonEmail}
              onChange={(e) => setNewPersonEmail(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1"
            />
            <input
              placeholder="Rol (opcional)"
              value={newPersonRole}
              onChange={(e) => setNewPersonRole(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1"
            />
            <div className="flex gap-2">
              <button
                onClick={addPerson}
                className="text-xs bg-accent text-white px-3 py-1 rounded"
              >
                Anadir
              </button>
              <button className="text-xs text-gray-500" onClick={() => setShowAddPerson(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recent invoices */}
      <div className="p-5 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Facturas recientes ({contact._count.invoices} total)
        </h3>
        {contact.invoices.length === 0 ? (
          <p className="text-sm text-gray-400">Sin facturas</p>
        ) : (
          <div className="space-y-2">
            {contact.invoices.slice(0, 5).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{inv.number}</span>
                  <span className="text-xs text-gray-400">{formatDate(inv.issueDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-700">{formatAmount(inv.totalAmount)}</span>
                  <Badge value={inv.status} />
                </div>
              </div>
            ))}
          </div>
        )}
        {contact._count.invoices > 5 && (
          <a
            href={`/facturas?contactId=${contact.id}`}
            className="inline-flex items-center gap-1 text-xs text-accent mt-2 hover:underline"
          >
            Ver facturas <ArrowRight size={12} />
          </a>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-5 border-t border-gray-200 flex gap-2 flex-shrink-0 mt-auto">
        <button
          onClick={onEdit}
          className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:opacity-90"
        >
          Editar
        </button>
        <button
          onClick={onEnrich}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
        >
          <Sparkles size={14} /> Enriquecer
        </button>
      </div>
    </div>
  );
}

// ── EmptyDetailState ──

function EmptyDetailState() {
  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center">
        <Users size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Selecciona un contacto para ver los detalles</p>
      </div>
    </div>
  );
}

// ── ContactModal ──

interface ContactFormData {
  name: string;
  cif: string;
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  email: string;
  iban: string;
  accountingEmail: string;
  accountingContact: string;
  paymentTermsDays: string;
  preferredLanguage: string;
}

function ContactModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: ContactFormData | null;
  onClose: () => void;
  onSave: (data: ContactFormData) => void;
  saving: boolean;
}) {
  const isEdit = !!initial?.name;
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ContactFormData>(
    initial ?? {
      name: "",
      cif: "",
      type: "CUSTOMER",
      email: "",
      iban: "",
      accountingEmail: "",
      accountingContact: "",
      paymentTermsDays: "",
      preferredLanguage: "es",
    }
  );

  const set = (field: keyof ContactFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Editar contacto" : "Nuevo contacto"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                setFormErrors({});
              }}
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.name ? "border-red" : "border-subtle"}`}
              placeholder="Empresa S.L."
            />
            {formErrors.name && <p className="text-[11px] text-red mt-1">{formErrors.name}</p>}
          </div>

          {/* CIF + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CIF/NIF</label>
              <input
                value={form.cif}
                onChange={(e) => set("cif", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="B12345678"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <div className="flex gap-2 mt-1">
                {(["CUSTOMER", "SUPPLIER", "BOTH"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("type", t)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      form.type === t
                        ? "bg-accent text-white border-accent"
                        : "border-gray-300 text-gray-600 hover:border-blue-400"
                    }`}
                  >
                    {TYPE_BADGE[t].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Email + IBAN */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                type="email"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email@empresa.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">IBAN</label>
              <input
                value={form.iban}
                onChange={(e) => set("iban", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ES12 3456 7890 1234 5678"
              />
            </div>
          </div>

          {/* Accounting email + contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email contable</label>
              <input
                value={form.accountingEmail}
                onChange={(e) => set("accountingEmail", e.target.value)}
                type="email"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contacto contable
              </label>
              <input
                value={form.accountingContact}
                onChange={(e) => set("accountingContact", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Payment terms + Language */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Plazo de pago (dias)
              </label>
              <input
                value={form.paymentTermsDays}
                onChange={(e) => set("paymentTermsDays", e.target.value)}
                type="number"
                min="0"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Idioma</label>
              <select
                value={form.preferredLanguage}
                onChange={(e) => set("preferredLanguage", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="es">Espanol</option>
                <option value="en">English</option>
                <option value="ca">Catala</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!form.name.trim()) {
                setFormErrors({ name: "El nombre es obligatorio" });
                return;
              }
              setFormErrors({});
              onSave(form);
            }}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function ContactosPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<ContactFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Build query string
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", "50");
  if (filter !== "all") params.set("type", filter);
  if (search) params.set("search", search);

  const {
    data: listData,
    loading,
    error: listError,
    refetch,
  } = useFetch<PaginatedContacts>(`/api/contacts?${params.toString()}`, [page, filter, search]);

  const contacts = listData?.data ?? [];
  const totalPages = listData?.pagination?.totalPages ?? 1;

  // Detail fetch
  const { data: detailData, refetch: refetchDetail } = useFetch<ContactDetail>(
    selectedId ? `/api/contacts/${selectedId}` : null,
    [selectedId]
  );

  // Handlers
  function handleOpenCreate() {
    setEditData(null);
    setShowModal(true);
  }

  function handleOpenEdit() {
    if (!detailData) return;
    setEditData({
      name: detailData.name,
      cif: detailData.cif ?? "",
      type: detailData.type,
      email: detailData.email ?? "",
      iban: detailData.iban ?? "",
      accountingEmail: detailData.accountingEmail ?? "",
      accountingContact: detailData.accountingContact ?? "",
      paymentTermsDays:
        detailData.paymentTermsDays != null ? String(detailData.paymentTermsDays) : "",
      preferredLanguage: detailData.preferredLanguage ?? "es",
    });
    setShowModal(true);
  }

  async function handleSave(form: ContactFormData) {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        cif: form.cif || null,
        type: form.type,
        email: form.email || null,
        iban: form.iban || null,
        accountingEmail: form.accountingEmail || null,
        accountingContact: form.accountingContact || null,
        paymentTermsDays: form.paymentTermsDays ? parseInt(form.paymentTermsDays) : null,
        preferredLanguage: form.preferredLanguage || "es",
      };

      if (editData?.name && selectedId) {
        await api.put(`/api/contacts/${selectedId}`, payload);
        refetchDetail();
      } else {
        await api.post("/api/contacts", payload);
      }
      refetch();
      setShowModal(false);
    } catch {
      // error handled by api client
    }
    setSaving(false);
  }

  async function handleEnrich() {
    if (!selectedId) return;
    try {
      await api.post("/api/contacts/enrich", { contactIds: [selectedId] });
      refetchDetail();
      refetch();
    } catch {
      // error handled by api client
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* LEFT: Contact list */}
      <div className="w-[480px] border-r border-gray-200 overflow-hidden flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-semibold text-gray-900">Contactos</h1>
            <div className="flex items-center gap-2">
              {/* Bulk actions dropdown */}
              <div className="relative">
                <button
                  onClick={() => setActionsOpen(!actionsOpen)}
                  className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-blue-400"
                >
                  Acciones
                </button>
                {actionsOpen && (
                  <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-40">
                    <button
                      disabled
                      className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 w-full text-left cursor-not-allowed"
                      title="Próximamente"
                    >
                      <Upload size={12} /> Importar
                      <span className="ml-auto text-[10px] text-text-tertiary">Próximamente</span>
                    </button>
                    <button
                      className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 w-full text-left"
                      disabled={actionLoading === "dedup"}
                      onClick={async () => {
                        setActionsOpen(false);
                        setActionLoading("dedup");
                        try {
                          await api.post("/api/contacts/deduplicate");
                          refetch();
                          setToast({ message: "Contactos deduplicados", type: "success" });
                        } catch {
                          setToast({ message: "Error al deduplicar contactos", type: "error" });
                        } finally {
                          setActionLoading(null);
                        }
                      }}
                    >
                      <GitMerge size={12} /> Deduplicar
                    </button>
                    <button
                      className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 w-full text-left"
                      disabled={actionLoading === "enrich"}
                      onClick={async () => {
                        setActionsOpen(false);
                        setActionLoading("enrich");
                        try {
                          await api.post("/api/contacts/enrich");
                          refetch();
                          setToast({ message: "Contactos enriquecidos", type: "success" });
                        } catch {
                          setToast({ message: "Error al enriquecer contactos", type: "error" });
                        } finally {
                          setActionLoading(null);
                        }
                      }}
                    >
                      <Sparkles size={12} /> Enriquecer todos
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-accent text-white rounded-lg hover:opacity-90"
              >
                <Plus size={14} /> Nuevo
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, CIF o email..."
              className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(
              [
                { key: "all", label: "Todos", icon: Users },
                { key: "CUSTOMER", label: "Clientes", icon: Users },
                { key: "SUPPLIER", label: "Proveedores", icon: Building2 },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setFilter(key);
                  setPage(1);
                }}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filter === key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white border-gray-200 text-gray-600 hover:border-blue-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400">Cargando...</div>
          ) : listError ? (
            <div className="p-4 text-sm text-red-500">
              <p className="font-medium">Error al cargar contactos</p>
              <button onClick={refetch} className="text-xs text-accent mt-2 hover:underline">
                Reintentar
              </button>
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay contactos</p>
              <button
                onClick={handleOpenCreate}
                className="text-xs text-accent mt-2 hover:underline"
              >
                Crear primer contacto
              </button>
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="text-left text-[10px] uppercase text-gray-400 tracking-wider">
                  <th className="px-4 py-2 font-semibold">Nombre</th>
                  <th className="px-4 py-2 font-semibold">Tipo</th>
                  <th className="px-4 py-2 font-semibold">Email</th>
                  <th className="px-4 py-2 font-semibold">Riesgo</th>
                  <th className="px-4 py-2 font-semibold text-right min-w-[80px]">Facturas</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    selected={selectedId === c.id}
                    onClick={() => setSelectedId(c.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Detail panel */}
      <div className="flex-1 overflow-hidden">
        {detailData ? (
          <ContactDetailPanel
            key={selectedId}
            contact={detailData}
            onEdit={handleOpenEdit}
            onEnrich={handleEnrich}
            onPeopleChange={refetchDetail}
          />
        ) : (
          <EmptyDetailState />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ContactModal
          initial={editData}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
