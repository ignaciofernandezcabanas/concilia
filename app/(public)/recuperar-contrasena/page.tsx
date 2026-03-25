/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/api-client";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";

const colors = {
  midnight: "#0f1923",
  deep: "#162231",
  steel: "#2a3f52",
  muted: "#6b8299",
  silver: "#94a3b8",
  cloud: "#cbd5e1",
  white: "#ffffff",
  teal: "#0d9488",
  tealDark: "#0f766e",
  tealGlow: "rgba(13,148,136,0.15)",
  red: "#ef4444",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${colors.steel}`,
  background: colors.deep,
  color: colors.white,
  fontSize: 15,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: colors.silver,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  marginBottom: 6,
};

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const sb = getSupabase();
    if (!sb) return;

    setSubmitting(true);
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setSubmitting(false);

    if (error) {
      setError(getAuthErrorMessage(error.message));
    } else {
      setSent(true);
    }
  }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          background: colors.midnight,
          position: "relative",
        }}
      >
        {/* Left decorative panel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "80px 64px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `radial-gradient(${colors.steel} 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
              opacity: 0.1,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-20%",
              left: "-10%",
              width: 500,
              height: 500,
              background: `radial-gradient(circle, ${colors.tealGlow} 0%, transparent 70%)`,
              borderRadius: "50%",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <Link
              href="/landing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 40,
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${colors.teal}, ${colors.tealDark})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: 20,
                  color: colors.white,
                }}
              >
                C
              </div>
              <span
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: 24,
                  color: colors.white,
                  letterSpacing: "-0.02em",
                }}
              >
                Concilia
              </span>
            </Link>

            <h2
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 40,
                color: colors.white,
                lineHeight: 1.2,
                marginBottom: 24,
              }}
            >
              Recupera tu acceso.
              <br />
              <span style={{ color: colors.teal }}>Es rápido y sencillo.</span>
            </h2>
          </div>
        </div>

        {/* Right form panel */}
        <div
          style={{
            width: 480,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 48px",
            background: colors.deep,
            borderLeft: `1px solid ${colors.steel}`,
          }}
        >
          <div style={{ width: "100%" }}>
            <h3
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 28,
                color: colors.white,
                marginBottom: 8,
              }}
            >
              Recuperar contraseña
            </h3>
            <p
              style={{
                fontSize: 14,
                color: colors.muted,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginBottom: 32,
              }}
            >
              Te enviaremos un enlace para restablecer tu contraseña.
            </p>

            {sent ? (
              <div>
                <div
                  style={{
                    padding: "20px 24px",
                    borderRadius: 12,
                    background: "rgba(13,148,136,0.1)",
                    border: `1px solid rgba(13,148,136,0.2)`,
                    marginBottom: 24,
                  }}
                >
                  <p
                    style={{
                      fontSize: 15,
                      color: colors.cloud,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    Te hemos enviado un email con las instrucciones para restablecer tu contraseña.
                    Revisa tu bandeja de entrada.
                  </p>
                </div>
                <Link
                  href="/login"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "14px 24px",
                    borderRadius: 10,
                    border: "none",
                    background: colors.teal,
                    color: colors.white,
                    fontSize: 15,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "center",
                    textDecoration: "none",
                    boxSizing: "border-box",
                  }}
                >
                  Volver a iniciar sesión
                </Link>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <div>
                  <label htmlFor="recovery-email" style={labelStyle}>
                    Email
                  </label>
                  <input
                    id="recovery-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                    placeholder="tu@empresa.com"
                    required
                    onFocus={(e: any) => (e.target.style.borderColor = colors.teal)}
                    onBlur={(e: any) => (e.target.style.borderColor = colors.steel)}
                  />
                </div>

                {error && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      fontSize: 14,
                      color: colors.red,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "14px 24px",
                    borderRadius: 10,
                    border: "none",
                    background: colors.teal,
                    color: colors.white,
                    fontSize: 15,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    marginTop: 8,
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  {submitting ? "Enviando..." : "Enviar enlace de recuperación"}
                </button>
              </form>
            )}

            <p
              style={{
                marginTop: 24,
                fontSize: 14,
                color: colors.muted,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                textAlign: "center",
              }}
            >
              <Link
                href="/login"
                style={{ color: colors.teal, textDecoration: "none", fontWeight: 600 }}
              >
                Volver a iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
