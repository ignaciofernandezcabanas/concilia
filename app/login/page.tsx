/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
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
  tealLight: "#14b8a6",
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

export default function LoginPage() {
  const { signIn, session, loading, isConfigured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && (session || !isConfigured)) {
      router.push("/");
    }
  }, [loading, session, isConfigured, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/");
    }
  }

  async function handleOAuth(provider: "google" | "azure") {
    const sb = getSupabase();
    if (!sb) return;
    setError("");
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(getAuthErrorMessage(error.message));
  }

  if (loading) return null;
  if (!isConfigured) return null;

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
              Bienvenido de vuelta.
              <br />
              <span style={{ color: colors.teal }}>Tu agente te espera.</span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 40 }}>
              {[
                { icon: "📊", text: "Tu dashboard te espera con las últimas conciliaciones." },
                { icon: "🔔", text: "Revisa las excepciones pendientes de tu aprobación." },
                { icon: "📈", text: "Aging, tesorería y reporting actualizados al minuto." },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span
                    style={{
                      fontSize: 15,
                      color: colors.cloud,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
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
              Inicia sesión
            </h3>
            <p
              style={{
                fontSize: 14,
                color: colors.muted,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginBottom: 32,
              }}
            >
              Accede a tu panel de controlling.
            </p>

            {/* Google button */}
            <button
              onClick={() => handleOAuth("google")}
              style={{
                width: "100%",
                padding: "12px 24px",
                borderRadius: 10,
                border: `1px solid ${colors.steel}`,
                background: "transparent",
                color: colors.cloud,
                fontSize: 15,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 12,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e: any) => {
                e.currentTarget.style.borderColor = colors.teal;
                e.currentTarget.style.background = "rgba(13,148,136,0.05)";
              }}
              onMouseLeave={(e: any) => {
                e.currentTarget.style.borderColor = colors.steel;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continuar con Google
            </button>

            {/* Microsoft button */}
            <button
              onClick={() => handleOAuth("azure")}
              style={{
                width: "100%",
                padding: "12px 24px",
                borderRadius: 10,
                border: `1px solid ${colors.steel}`,
                background: "transparent",
                color: colors.cloud,
                fontSize: 15,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 24,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e: any) => {
                e.currentTarget.style.borderColor = colors.teal;
                e.currentTarget.style.background = "rgba(13,148,136,0.05)";
              }}
              onMouseLeave={(e: any) => {
                e.currentTarget.style.borderColor = colors.steel;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              Continuar con Microsoft
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1, height: 1, background: colors.steel }} />
              <span
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                o con email
              </span>
              <div style={{ flex: 1, height: 1, background: colors.steel }} />
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <div>
                <label htmlFor="login-email" style={labelStyle}>
                  Email
                </label>
                <input
                  id="login-email"
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
              <div>
                <label htmlFor="login-password" style={labelStyle}>
                  Contraseña
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                  placeholder="••••••••"
                  required
                  onFocus={(e: any) => (e.target.style.borderColor = colors.teal)}
                  onBlur={(e: any) => (e.target.style.borderColor = colors.steel)}
                />
              </div>
              <div style={{ textAlign: "right", marginTop: -8 }}>
                <Link
                  href="/recuperar-contrasena"
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    textDecoration: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              {error && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: "rgba(239,68,68,0.1)",
                    border: `1px solid rgba(239,68,68,0.2)`,
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
                {submitting ? "Entrando..." : "Iniciar sesión"}
              </button>
            </form>

            <p
              style={{
                marginTop: 24,
                fontSize: 14,
                color: colors.muted,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                textAlign: "center",
              }}
            >
              ¿No tienes cuenta?{" "}
              <Link
                href="/signup"
                style={{ color: colors.teal, textDecoration: "none", fontWeight: 600 }}
              >
                Regístrate gratis
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
