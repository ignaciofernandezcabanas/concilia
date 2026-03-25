"use client";

import { useState, useCallback } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { formatAmount, formatDate } from "@/lib/format";
import {
  Plus,
  Building2,
  CreditCard,
  Landmark,
  PiggyBank,
  HandCoins,
  ArrowLeftRight,
  FileStack,
  ChevronDown,
  ChevronRight,
  Edit2,
  Power,
  PowerOff,
  Wifi,
  Upload,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BankAccount {
  id: string;
  iban: string;
  bankName: string | null;
  alias: string | null;
  isActive: boolean;
  accountType: string;
  connectionMethod: string;
  pgcAccountCode: string | null;
  lastFourDigits: string | null;
  contractNumber: string | null;
  creditLimit: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  startDate: string | null;
  maturityDate: string | null;
  currentBalance: number | null;
  currentBalanceDate: string | null;
  currency: string;
  transactionCount: number;
}

interface AccountsResponse {
  accounts: {
    operativas: BankAccount[];
    financiacion: BankAccount[];
    inactivas: BankAccount[];
  };
  totals: {
    operativas: number;
    financiacion: number;
  };
}

const ACCOUNT_TYPES = [
  {
    value: "CHECKING",
    label: "Cuenta corriente",
    desc: "Cuenta operativa principal",
    icon: Building2,
  },
  {
    value: "SAVINGS",
    label: "Cuenta de ahorro",
    desc: "Depósitos y ahorro",
    icon: PiggyBank,
  },
  {
    value: "CREDIT_LINE",
    label: "Línea de crédito",
    desc: "Póliza de crédito renovable",
    icon: HandCoins,
  },
  {
    value: "LOAN",
    label: "Préstamo",
    desc: "Préstamo a plazo fijo",
    icon: Landmark,
  },
  {
    value: "CREDIT_CARD",
    label: "Tarjeta de crédito",
    desc: "Tarjeta corporativa",
    icon: CreditCard,
  },
  {
    value: "CONFIRMING",
    label: "Confirming",
    desc: "Financiación de proveedores",
    icon: ArrowLeftRight,
  },
  {
    value: "FACTORING",
    label: "Factoring",
    desc: "Anticipo de facturas emitidas",
    icon: FileStack,
  },
] as const;

type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

const TYPE_ICON: Record<string, typeof Building2> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.icon])
);

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedBank, setDetectedBank] = useState<string | null>(null);

  // Form fields
  const [alias, setAlias] = useState("");
  const [iban, setIban] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [connectionMethod, setConnectionMethod] = useState("FILE_IMPORT");
  const [suggestedPGC, setSuggestedPGC] = useState("");

  const detectBank = useCallback(async (ibanVal: string) => {
    const cleaned = ibanVal.replace(/\s/g, "");
    if (cleaned.length >= 8) {
      try {
        const res = await api.get<{ bankName: string }>(
          `/api/bank-accounts/detect-bank?iban=${encodeURIComponent(cleaned)}`
        );
        setDetectedBank(res.bankName);
      } catch {
        setDetectedBank(null);
      }
    }
  }, []);

  const needsIBAN = ["CHECKING", "SAVINGS", "CREDIT_LINE", "CONFIRMING", "FACTORING"];
  const needsLastFour = ["CREDIT_CARD"];
  const needsFinancing = ["LOAN", "CREDIT_LINE", "CONFIRMING", "FACTORING"];
  const needsLoan = ["LOAN"];

  const handleSubmit = async () => {
    if (!selectedType || !alias) return;
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        accountType: selectedType,
        alias,
        connectionMethod,
      };

      if (needsIBAN.includes(selectedType) && iban) body.iban = iban;
      if (needsLastFour.includes(selectedType) && lastFour) body.lastFourDigits = lastFour;
      if (contractNumber) body.contractNumber = contractNumber;
      if (creditLimit) body.creditLimit = parseFloat(creditLimit);
      if (interestRate) body.interestRate = parseFloat(interestRate);
      if (monthlyPayment) body.monthlyPayment = parseFloat(monthlyPayment);
      if (maturityDate) body.maturityDate = maturityDate;
      if (initialBalance) body.initialBalance = parseFloat(initialBalance);
      if (suggestedPGC) body.pgcAccountCode = suggestedPGC;

      await api.post("/api/bank-accounts", body);
      onCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear cuenta";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-subtle">
          <h2 className="text-[16px] font-semibold text-text-primary">
            {step === 1
              ? "Tipo de cuenta"
              : `Nueva ${ACCOUNT_TYPES.find((t) => t.value === selectedType)?.label}`}
          </h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-sm">
            Cerrar
          </button>
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="grid grid-cols-1 gap-2">
              {ACCOUNT_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => {
                      setSelectedType(t.value);
                      setStep(2);
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg border border-subtle hover:border-accent/40 hover:bg-accent/5 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-secondary flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-text-secondary" />
                    </div>
                    <div>
                      <span className="text-[13px] font-medium text-text-primary block">
                        {t.label}
                      </span>
                      <span className="text-[11px] text-text-tertiary">{t.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && selectedType && (
            <div className="flex flex-col gap-4">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-[12px] text-accent hover:underline self-start"
              >
                <ArrowLeft size={12} /> Cambiar tipo
              </button>

              {/* Alias */}
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-text-secondary">Alias *</span>
                <input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="Ej: Cuenta principal BBVA"
                  className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>

              {/* IBAN */}
              {needsIBAN.includes(selectedType) && (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-text-secondary">IBAN *</span>
                  <input
                    value={iban}
                    onChange={(e) => {
                      setIban(e.target.value);
                      detectBank(e.target.value);
                    }}
                    placeholder="ES76 2077 0024 0031 0257 5766"
                    className="border border-subtle rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  {detectedBank && (
                    <span className="text-[11px] text-green-600">
                      Banco detectado: {detectedBank}
                    </span>
                  )}
                </label>
              )}

              {/* Last 4 digits */}
              {needsLastFour.includes(selectedType) && (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-text-secondary">
                    Últimos 4 dígitos *
                  </span>
                  <input
                    value={lastFour}
                    onChange={(e) => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="1234"
                    maxLength={4}
                    className="border border-subtle rounded-md px-3 py-2 text-[13px] font-mono w-24 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </label>
              )}

              {/* Contract number */}
              {(needsFinancing.includes(selectedType) || selectedType === "CREDIT_CARD") && (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-text-secondary">N. contrato</span>
                  <input
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </label>
              )}

              {/* Financing fields */}
              {needsFinancing.includes(selectedType) && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-text-secondary">
                      Límite de crédito *
                    </span>
                    <input
                      type="number"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      placeholder="50000"
                      className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[12px] font-medium text-text-secondary">
                        Tipo interés (%) {needsLoan.includes(selectedType) ? "*" : ""}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        placeholder="4.5"
                        className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[12px] font-medium text-text-secondary">
                        Vencimiento
                      </span>
                      <input
                        type="date"
                        value={maturityDate}
                        onChange={(e) => setMaturityDate(e.target.value)}
                        className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </label>
                  </div>
                </>
              )}

              {/* Loan-specific */}
              {needsLoan.includes(selectedType) && (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-text-secondary">
                    Cuota mensual *
                  </span>
                  <input
                    type="number"
                    value={monthlyPayment}
                    onChange={(e) => setMonthlyPayment(e.target.value)}
                    placeholder="2340"
                    className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </label>
              )}

              {/* Initial balance */}
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-text-secondary">Saldo inicial</span>
                <input
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  placeholder="0.00"
                  className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>

              {/* Connection method */}
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-text-secondary">Conexión</span>
                <select
                  value={connectionMethod}
                  onChange={(e) => setConnectionMethod(e.target.value)}
                  className="border border-subtle rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="FILE_IMPORT">Importación ficheros</option>
                  <option value="PSD2">Open Banking (PSD2)</option>
                </select>
              </label>

              {/* PGC code suggestion */}
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-text-secondary">Cuenta PGC</span>
                <input
                  value={suggestedPGC}
                  onChange={(e) => setSuggestedPGC(e.target.value)}
                  placeholder="Se auto-asigna al crear"
                  className="border border-subtle rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="text-[10px] text-text-tertiary">
                  Déjalo vacío para auto-asignar
                </span>
              </label>

              {error && <p className="text-[12px] text-red-600 bg-red-50 p-2 rounded">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={saving || !alias}
                className="mt-2 bg-accent text-white rounded-md py-2 text-[13px] font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Creando..." : "Crear cuenta"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account card
// ---------------------------------------------------------------------------

function AccountCard({ account, onAction }: { account: BankAccount; onAction: () => void }) {
  const Icon = TYPE_ICON[account.accountType] || Building2;
  const isFinancing = ["CREDIT_LINE", "LOAN", "CONFIRMING", "FACTORING"].includes(
    account.accountType
  );

  const handleToggle = async () => {
    const endpoint = account.isActive ? "deactivate" : "reactivate";
    await api.post(`/api/bank-accounts/${account.id}/${endpoint}`);
    onAction();
  };

  const identifier = account.iban
    ? `${account.iban.substring(0, 4)} •••• ${account.iban.slice(-4)}`
    : account.lastFourDigits
      ? `•••• ${account.lastFourDigits}`
      : (account.contractNumber ?? "—");

  const typeLabel =
    ACCOUNT_TYPES.find((t) => t.value === account.accountType)?.label ?? account.accountType;

  return (
    <div
      className={`border rounded-lg p-4 flex flex-col gap-2 ${
        account.isActive
          ? "border-subtle bg-white"
          : "border-dashed border-subtle/60 bg-surface-secondary/50"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center">
            <Icon size={16} className="text-text-secondary" />
          </div>
          <div>
            <span className="text-[13px] font-semibold text-text-primary block">
              {account.alias || typeLabel}
            </span>
            <span className="text-[11px] text-text-tertiary font-mono">{identifier}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {account.connectionMethod === "PSD2" ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-light text-accent inline-flex items-center gap-0.5">
              <Wifi size={10} /> PSD2
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-hover text-text-secondary inline-flex items-center gap-0.5">
              <Upload size={10} /> Manual
            </span>
          )}
          <Link
            href={`/ajustes/bancos?edit=${account.id}`}
            className="p-1 rounded hover:bg-hover text-text-tertiary"
            title="Editar"
          >
            <Edit2 size={13} />
          </Link>
          <button
            onClick={handleToggle}
            className="p-1 rounded hover:bg-hover text-text-tertiary"
            title={account.isActive ? "Desactivar" : "Reactivar"}
          >
            {account.isActive ? <PowerOff size={13} /> : <Power size={13} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-1">
        {account.currentBalance != null && (
          <div>
            <span className="text-[10px] text-text-tertiary block">Saldo</span>
            <span
              className={`text-[14px] font-semibold ${account.currentBalance >= 0 ? "text-text-primary" : "text-red-600"}`}
            >
              {formatAmount(account.currentBalance, account.currency)}
            </span>
          </div>
        )}
        {account.pgcAccountCode && (
          <div>
            <span className="text-[10px] text-text-tertiary block">PGC</span>
            <span className="text-[12px] font-mono text-text-secondary">
              {account.pgcAccountCode}
            </span>
          </div>
        )}
        {account.bankName && (
          <div>
            <span className="text-[10px] text-text-tertiary block">Banco</span>
            <span className="text-[12px] text-text-secondary">{account.bankName}</span>
          </div>
        )}
      </div>

      {/* Financing details */}
      {isFinancing && (
        <div className="flex items-center gap-4 border-t border-subtle/50 pt-2 mt-1">
          {account.creditLimit != null && (
            <div>
              <span className="text-[10px] text-text-tertiary block">Límite</span>
              <span className="text-[12px] text-text-secondary">
                {formatAmount(account.creditLimit, account.currency)}
              </span>
            </div>
          )}
          {account.creditLimit != null && account.currentBalance != null && (
            <div>
              <span className="text-[10px] text-text-tertiary block">Dispuesto</span>
              <span className="text-[12px] text-text-secondary">
                {formatAmount(Math.abs(account.currentBalance), account.currency)}
              </span>
            </div>
          )}
          {account.interestRate != null && (
            <div>
              <span className="text-[10px] text-text-tertiary block">Tipo</span>
              <span className="text-[12px] text-text-secondary">{account.interestRate}%</span>
            </div>
          )}
          {account.maturityDate && (
            <div>
              <span className="text-[10px] text-text-tertiary block">Vencimiento</span>
              <span className="text-[12px] text-text-secondary">
                {formatDate(new Date(account.maturityDate), "short")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BancosPage() {
  const { data, loading, refetch } = useFetch<AccountsResponse>("/api/bank-accounts");
  const [showCreate, setShowCreate] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const handleRefresh = () => refetch();

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <TopBar title="Cuentas bancarias" />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  const accounts = data?.accounts;
  const totals = data?.totals;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Cuentas bancarias" />
      <div className="flex flex-col gap-6 p-6 px-8 flex-1 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-text-primary">Cuentas bancarias</h1>
            <p className="text-[13px] text-text-secondary mt-0.5">
              Gestiona las cuentas de tu empresa
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-accent/90 transition-colors"
          >
            <Plus size={14} /> Añadir cuenta
          </button>
        </div>

        {/* Operativas */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold text-text-primary">Operativas</h2>
            {totals && (
              <span className="text-[13px] font-medium text-text-secondary">
                Total: {formatAmount(totals.operativas)}
              </span>
            )}
          </div>
          {accounts?.operativas.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {accounts.operativas.map((a) => (
                <AccountCard key={a.id} account={a} onAction={handleRefresh} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-text-tertiary py-4 text-center border border-dashed border-subtle rounded-lg">
              No hay cuentas operativas. Añade tu primera cuenta corriente.
            </p>
          )}
        </section>

        {/* Financiación */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold text-text-primary">Financiación</h2>
            {totals && (
              <span className="text-[13px] font-medium text-text-secondary">
                Total: {formatAmount(totals.financiacion)}
              </span>
            )}
          </div>
          {accounts?.financiacion.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {accounts.financiacion.map((a) => (
                <AccountCard key={a.id} account={a} onAction={handleRefresh} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-text-tertiary py-4 text-center border border-dashed border-subtle rounded-lg">
              No hay cuentas de financiación configuradas.
            </p>
          )}
        </section>

        {/* Inactivas (collapsed) */}
        {accounts?.inactivas && accounts.inactivas.length > 0 && (
          <section>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors mb-3"
            >
              {showInactive ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Inactivas ({accounts.inactivas.length})
            </button>
            {showInactive && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {accounts.inactivas.map((a) => (
                  <AccountCard key={a.id} account={a} onAction={handleRefresh} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
