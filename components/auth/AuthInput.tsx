/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { colors, fonts } from "./AuthLayout";

/* ---------- Input ---------- */

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${colors.steel}`,
  background: colors.deep,
  color: colors.white,
  fontSize: 15,
  fontFamily: fonts.sans,
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: colors.silver,
  fontFamily: fonts.sans,
  marginBottom: 6,
};

export default function AuthInput({ label, id, ...props }: AuthInputProps) {
  const inputId = id ?? `auth-${label.toLowerCase().replace(/\s/g, "-")}`;
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={inputId} style={labelStyle}>
        {label}
      </label>
      <input
        id={inputId}
        style={inputStyle}
        onFocus={(e: any) => (e.target.style.borderColor = colors.teal)}
        onBlur={(e: any) => (e.target.style.borderColor = colors.steel)}
        {...props}
      />
    </div>
  );
}

/* ---------- Button ---------- */

export function AuthButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      disabled={loading}
      style={{
        width: "100%",
        padding: "14px 24px",
        borderRadius: 10,
        border: "none",
        background: colors.teal,
        color: colors.white,
        fontSize: 15,
        fontFamily: fonts.sans,
        fontWeight: 700,
        cursor: loading ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        marginTop: 8,
        opacity: loading ? 0.5 : 1,
      }}
      {...props}
    >
      {loading ? "Cargando..." : children}
    </button>
  );
}

/* ---------- Divider ---------- */

export function AuthDivider({ text = "o con email" }: { text?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
      <div style={{ flex: 1, height: 1, background: colors.steel }} />
      <span style={{ fontSize: 13, color: colors.muted, fontFamily: fonts.sans }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: colors.steel }} />
    </div>
  );
}

/* ---------- Error ---------- */

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        background: "rgba(239,68,68,0.1)",
        border: "1px solid rgba(239,68,68,0.2)",
        fontSize: 14,
        color: colors.red,
        fontFamily: fonts.sans,
        marginBottom: 16,
      }}
    >
      {message}
    </div>
  );
}

/* ---------- Success ---------- */

export function AuthSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        background: "rgba(34,197,94,0.1)",
        border: "1px solid rgba(34,197,94,0.2)",
        fontSize: 14,
        color: colors.green,
        fontFamily: fonts.sans,
        marginBottom: 16,
      }}
    >
      {message}
    </div>
  );
}
