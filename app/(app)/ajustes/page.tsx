"use client";

import { useState, useEffect } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import Badge from "@/components/Badge";
import { useCompany, useUsers } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { useAuth } from "@/components/AuthProvider";
import LearningTab from "@/components/LearningTab";
import {
  Plus,
  Check,
  Save,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type Tab = "users" | "company" | "integrations" | "learning";

export default function Ajustes() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  // Derive role from user email by checking against DB users
  // For simplicity, show integrations tab but it will block non-admins at API level
  const tabs: { value: Tab; label: string }[] = [
    { value: "users", label: "Usuarios" },
    { value: "company", label: "Empresa" },
    { value: "integrations", label: "Integraciones" },
    { value: "learning", label: "Aprendizaje" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Ajustes" />
      <div className="flex flex-col gap-6 p-6 px-8 flex-1 overflow-auto">
        <h1 className="text-[22px] font-semibold text-text-primary">Ajustes</h1>

        <div className="flex items-center gap-1 border-b border-subtle">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 pb-2 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t.value
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "users" && <UsersTab />}
        {tab === "company" && <CompanyTab />}
        {tab === "integrations" && <IntegrationsTab />}
        {tab === "learning" && <LearningTab />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Users Tab
// ══════════════════════════════════════════════════════════════

function UsersTab() {
  const { data, loading, refetch } = useUsers();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EDITOR");
  const [inviting, setInviting] = useState(false);

  const users = data?.data ?? [];

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await api.post("/api/settings/users", { email, role });
      setShowInvite(false);
      setEmail("");
      refetch();
    } catch (err) {
      console.error("Invite error:", err);
    } finally {
      setInviting(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-primary">Usuarios</h2>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md hover:bg-accent-dark transition-colors"
        >
          <Plus size={16} />
          Invitar usuario
        </button>
      </div>

      {showInvite && (
        <form onSubmit={inviteUser} className="bg-white rounded-lg border border-subtle p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-text-secondary block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 px-3 text-[13px] border border-subtle rounded-md">
              <option value="ADMIN">Admin</option>
              <option value="EDITOR">Editor</option>
              <option value="READER">Lector</option>
            </select>
          </div>
          <button type="submit" disabled={inviting} className="h-9 px-4 bg-accent text-white text-[13px] font-medium rounded-md disabled:opacity-50">
            {inviting ? "Enviando..." : "Enviar invitación"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg border border-subtle overflow-hidden">
        <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
          <span className="flex-1">Usuario</span>
          <span className="w-20">Rol</span>
          <span className="w-20">Estado</span>
          <span className="w-32">Último acceso</span>
        </div>
        {users.map((u, i) => (
          <div key={u.id} className={`flex items-center h-14 px-5 text-[13px] ${i < users.length - 1 ? "border-b border-subtle" : ""}`}>
            <div className="flex-1 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-[10px] font-semibold">
                {(u.name || u.email).substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-text-primary">{u.name || u.email}</div>
                <div className="text-[11px] text-text-tertiary">{u.email}</div>
              </div>
            </div>
            <span className="w-20"><Badge value={u.role} label={u.role} /></span>
            <span className="w-20"><Badge value={u.status} /></span>
            <span className="w-32 text-xs text-text-tertiary">
              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("es-ES") : "Nunca"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Company Tab
// ══════════════════════════════════════════════════════════════

function CompanyTab() {
  const { data, loading, refetch } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [success, setSuccess] = useState("");

  const company = data?.company;
  if (loading) return <LoadingSpinner />;
  if (!company) return null;

  const generalFields = [
    { key: "name", label: "Nombre de la empresa", value: company.name, type: "text" },
    { key: "cif", label: "CIF", value: company.cif, type: "text" },
    { key: "currency", label: "Moneda", value: company.currency, type: "text" },
  ];

  const thresholdFields = [
    { key: "autoApproveThreshold", label: "Umbral de confianza", value: (company as Record<string, unknown>).autoApproveThreshold as number ?? 0.95, type: "number", step: "0.01", hint: "Por debajo de este % las conciliaciones van a bandeja (0.95 = 95%)" },
    { key: "materialityThreshold", label: "Materialidad mayor (€)", value: (company as Record<string, unknown>).materialityThreshold as number ?? 500, type: "number", step: "1", hint: "Transacciones por encima siempre van a bandeja, independientemente de la confianza" },
    { key: "materialityMinor", label: "Materialidad menor (€)", value: (company as Record<string, unknown>).materialityMinor as number ?? 5, type: "number", step: "0.01", hint: "Diferencias por debajo se auto-resuelven como ajuste menor (ej. comisiones bancarias)" },
    { key: "preAlertDays", label: "Días de pre-alerta", value: (company as Record<string, unknown>).preAlertDays as number ?? 7, type: "number", step: "1", hint: "Alertar X días antes del vencimiento de una factura" },
  ];

  const fields = [...generalFields, ...thresholdFields];

  async function handleSave() {
    setSaving(true);
    setSuccess("");
    try {
      await api.put("/api/settings/company", form);
      setSuccess("Guardado");
      setForm({});
      refetch();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {/* General */}
      <div className="bg-white rounded-lg border border-subtle p-6">
        <h2 className="text-[15px] font-semibold text-text-primary mb-4">Datos de la empresa</h2>
        <div className="flex flex-col gap-4">
          {generalFields.map((f) => (
            <SettingsField key={f.key} field={f} onChange={(val) => setForm((prev) => ({ ...prev, [f.key]: val }))} />
          ))}
        </div>
      </div>

      {/* Thresholds */}
      <div className="bg-white rounded-lg border border-subtle p-6">
        <h2 className="text-[15px] font-semibold text-text-primary mb-1">Umbrales de conciliación</h2>
        <p className="text-[11px] text-text-tertiary mb-4">Estos valores controlan qué se auto-aprueba y qué cae a la bandeja del controller.</p>
        <div className="flex flex-col gap-4">
          {thresholdFields.map((f) => (
            <SettingsField key={f.key} field={f} onChange={(val) => setForm((prev) => ({ ...prev, [f.key]: val }))} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {success && <p className="text-xs text-green-text">{success}</p>}
        <button
          onClick={handleSave}
          disabled={saving || Object.keys(form).length === 0}
          className="flex items-center gap-2 self-start bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md disabled:opacity-50 hover:bg-accent-dark transition-colors"
        >
          <Save size={14} />
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// LearningTab imported from components/LearningTab.tsx

function SettingsField({
  field,
  onChange,
}: {
  field: { key: string; label: string; value: string | number; type: string; step?: string; hint?: string };
  onChange: (val: string | number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-text-secondary block mb-1">{field.label}</label>
      <input
        type={field.type}
        defaultValue={field.value}
        step={field.step ?? (field.type === "number" ? "0.01" : undefined)}
        onChange={(e) => onChange(field.type === "number" ? parseFloat(e.target.value) : e.target.value)}
        className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
      />
      {field.hint && <p className="text-[10px] text-text-tertiary mt-1">{field.hint}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Integrations Tab (Admin only — enforced at API level)
// ══════════════════════════════════════════════════════════════

interface IntegrationState {
  status: string;
  hasCredentials?: boolean;
  hasApiKey?: boolean;
  lastSyncAt?: string;
  syncFrequency?: string;
  error?: string;
  accounts?: { email: string }[];
  accountIds?: string[];
  rootFolderId?: string;
  separateIssuedReceived?: boolean;
  folderFormat?: string;
}

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

const INTEGRATIONS: {
  key: string;
  name: string;
  description: string;
  apiPath: string;
  syncPath?: string;
  fields: FieldDef[];
}[] = [
  {
    key: "holded",
    name: "Holded",
    description: "Sincroniza facturas, contactos, plan de cuentas y pagos desde tu ERP.",
    apiPath: "/api/integrations/holded",
    syncPath: "/api/sync/holded",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "Tu API key de Holded", required: true },
      {
        key: "syncFrequency", label: "Frecuencia", type: "select",
        options: [
          { value: "hourly", label: "Cada hora" },
          { value: "6h", label: "Cada 6h" },
          { value: "daily", label: "Diaria" },
          { value: "manual", label: "Manual" },
        ],
      },
    ],
  },
  {
    key: "drive",
    name: "Google Drive",
    description: "Archiva facturas PDF trimestralmente en Google Drive.",
    apiPath: "/api/integrations/drive",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Google OAuth Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "OAuth Client Secret", required: true },
      { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "OAuth Refresh Token", required: true },
      { key: "rootFolderId", label: "Carpeta raíz (ID, opcional)", type: "text", placeholder: "ID de carpeta en Drive" },
    ],
  },
  {
    key: "gmail",
    name: "Gmail (solo lectura)",
    description: "Detecta facturas recibidas por email y descarga PDFs/XMLs. Soporta múltiples cuentas.",
    apiPath: "/api/integrations/gmail",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Google OAuth Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "OAuth Client Secret", required: true },
      { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "OAuth Refresh Token", required: true },
    ],
  },
];

function IntegrationsTab() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-secondary">
        Conecta servicios externos. Solo administradores pueden modificar estas configuraciones.
        Claude AI se configura vía variable de entorno (<code className="bg-hover px-1 rounded">ANTHROPIC_API_KEY</code>).
      </p>
      {INTEGRATIONS.map((int) => (
        <IntegrationCard key={int.key} config={int} />
      ))}
    </div>
  );
}

function IntegrationCard({ config }: { config: (typeof INTEGRATIONS)[number] }) {
  const [state, setState] = useState<IntegrationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Gmail multi-account state
  const isGmail = config.key === "gmail";
  const [gmailAccounts, setGmailAccounts] = useState<Record<string, string>[]>([{}]);

  useEffect(() => { loadState(); }, []);

  async function loadState() {
    setLoading(true);
    try {
      const res = await api.get<{ integration: IntegrationState }>(config.apiPath);
      setState(res.integration);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    let body: Record<string, unknown>;

    if (isGmail) {
      body = {
        accounts: gmailAccounts.filter((a) => a.clientId && a.clientSecret && a.refreshToken),
      };
    } else {
      body = { ...formData };
      if (body.accountIds && typeof body.accountIds === "string") {
        body.accountIds = (body.accountIds as string).split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    try {
      await api.put(config.apiPath, body);
      setSuccess("Conectado correctamente");
      setExpanded(false);
      setFormData({});
      loadState();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al conectar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar esta integración?")) return;
    try {
      await api.delete(config.apiPath);
      loadState();
    } catch {
      setError("Error al desconectar");
    }
  }

  async function handleSync() {
    if (!config.syncPath) return;
    setSyncing(true);
    setError("");
    try {
      await api.post(config.syncPath);
      setSuccess("Sincronización iniciada");
      loadState();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error en sincronización");
    } finally {
      setSyncing(false);
    }
  }

  const isConnected = state?.status === "CONNECTED" || state?.hasCredentials || state?.hasApiKey;

  return (
    <div className="bg-white rounded-lg border border-subtle overflow-hidden">
      <div className="flex items-center justify-between p-4 px-5">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-text-primary">{config.name}</span>
          {loading ? (
            <span className="text-xs text-text-tertiary">...</span>
          ) : isConnected ? (
            <Badge value="CONNECTED" />
          ) : (
            <Badge value="DISCONNECTED" />
          )}
          {state?.accounts && state.accounts.length > 0 && (
            <span className="text-[11px] text-text-tertiary">
              {state.accounts.map((a) => a.email).join(", ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isConnected && config.syncPath && (
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 px-3 h-7 text-xs text-accent font-medium border border-subtle rounded-md hover:bg-hover disabled:opacity-50">
              <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sync..." : "Sincronizar"}
            </button>
          )}
          {isConnected && (
            <button onClick={handleDisconnect} className="p-1 text-text-tertiary hover:text-red" title="Desconectar">
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-text-secondary">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <div className="px-5 pb-3 -mt-1">
        <p className="text-[11px] text-text-tertiary">{config.description}</p>
        {state?.lastSyncAt && (
          <p className="text-[11px] text-text-tertiary mt-0.5">
            Último sync: {new Date(state.lastSyncAt).toLocaleString("es-ES")}
          </p>
        )}
        {state?.error && <p className="text-[11px] text-red-text mt-0.5">{state.error}</p>}
      </div>

      {/* Drive folder config — shown when connected */}
      {isConnected && config.key === "drive" && (
        <DriveFolderConfig
          apiPath={config.apiPath}
          currentFolderId={state?.rootFolderId}
          separateIssuedReceived={state?.separateIssuedReceived ?? true}
          onUpdated={loadState}
        />
      )}

      {expanded && (
        <form onSubmit={handleSave} className="border-t border-subtle p-5 bg-page flex flex-col gap-3">
          {isGmail ? (
            <>
              {gmailAccounts.map((acct, idx) => (
                <div key={idx} className="flex flex-col gap-2 p-3 bg-white rounded border border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-secondary">Cuenta {idx + 1}</span>
                    {gmailAccounts.length > 1 && (
                      <button type="button" onClick={() => setGmailAccounts((a) => a.filter((_, i) => i !== idx))} className="text-xs text-red-text">
                        Eliminar
                      </button>
                    )}
                  </div>
                  {config.fields.map((field) => (
                    <input
                      key={field.key}
                      type={field.type}
                      value={acct[field.key] ?? ""}
                      onChange={(e) => {
                        const updated = [...gmailAccounts];
                        updated[idx] = { ...updated[idx], [field.key]: e.target.value };
                        setGmailAccounts(updated);
                      }}
                      placeholder={field.placeholder}
                      className="w-full h-8 px-3 text-[12px] border border-subtle rounded-md bg-white placeholder:text-text-tertiary"
                      required={field.required}
                    />
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setGmailAccounts((a) => [...a, {}])}
                className="text-xs text-accent font-medium self-start"
              >
                + Añadir otra cuenta
              </button>
            </>
          ) : (
            config.fields.map((field) => (
              <div key={field.key}>
                <label className="text-xs font-medium text-text-secondary block mb-1">{field.label}</label>
                {field.type === "select" ? (
                  <select
                    value={formData[field.key] ?? field.options?.[2]?.value ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md bg-white"
                  >
                    {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={formData[field.key] ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md bg-white placeholder:text-text-tertiary"
                    required={field.required}
                  />
                )}
              </div>
            ))
          )}

          {error && <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded">{error}</p>}
          {success && <p className="text-xs text-green-text bg-green-light px-3 py-2 rounded">{success}</p>}

          <div className="flex gap-2 mt-1">
            <button type="submit" disabled={saving} className="h-9 px-4 bg-accent text-white text-[13px] font-medium rounded-md disabled:opacity-50 hover:bg-accent-dark">
              {saving ? "Conectando..." : isConnected ? "Actualizar" : "Conectar"}
            </button>
            <button type="button" onClick={() => { setExpanded(false); setError(""); setSuccess(""); }} className="h-9 px-4 text-[13px] text-text-secondary border border-subtle rounded-md hover:bg-hover">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Drive Folder Config (shown after Drive is connected)
// ══════════════════════════════════════════════════════════════

function DriveFolderConfig({
  apiPath,
  currentFolderId,
  separateIssuedReceived,
  onUpdated,
}: {
  apiPath: string;
  currentFolderId?: string;
  separateIssuedReceived: boolean;
  onUpdated: () => void;
}) {
  const [folderId, setFolderId] = useState(currentFolderId ?? "");
  const [separate, setSeparate] = useState(separateIssuedReceived);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  async function handleSave() {
    setSaving(true);
    setSuccess("");
    try {
      await api.put(apiPath, {
        rootFolderId: folderId || undefined,
        separateIssuedReceived: separate,
      });
      setSuccess("Carpeta guardada");
      onUpdated();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  const changed = folderId !== (currentFolderId ?? "") || separate !== separateIssuedReceived;

  return (
    <div className="px-5 pb-4 flex flex-col gap-2 border-t border-subtle pt-3">
      <span className="text-xs font-semibold text-text-primary">Carpeta de almacenamiento</span>
      <p className="text-[11px] text-text-tertiary">
        Todas las facturas importadas (desde local, Drive o Holded) se guardarán en esta carpeta.
      </p>
      <div>
        <label className="text-[11px] font-medium text-text-secondary block mb-1">
          ID de carpeta de Google Drive
        </label>
        <input
          type="text"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          placeholder="Pega el ID de la carpeta de Drive"
          className="w-full h-8 px-3 text-[12px] border border-subtle rounded-md placeholder:text-text-tertiary"
        />
        <p className="text-[10px] text-text-tertiary mt-0.5">
          Abre la carpeta en Drive y copia el ID del final de la URL
        </p>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={separate}
          onChange={(e) => setSeparate(e.target.checked)}
          className="rounded border-subtle"
        />
        <span className="text-[12px] text-text-secondary">Separar en subcarpetas Emitidas / Recibidas</span>
      </label>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={handleSave}
          disabled={saving || !changed}
          className="h-7 px-3 bg-accent text-white text-[12px] font-medium rounded-md disabled:opacity-40 hover:bg-accent-dark"
        >
          {saving ? "Guardando..." : "Guardar carpeta"}
        </button>
        {success && <span className="text-[11px] text-green-text">{success}</span>}
        {currentFolderId && (
          <span className="text-[11px] text-text-tertiary ml-auto">
            Actual: ...{currentFolderId.slice(-12)}
          </span>
        )}
      </div>
    </div>
  );
}
