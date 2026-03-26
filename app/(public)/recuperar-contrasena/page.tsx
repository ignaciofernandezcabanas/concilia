"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/api-client";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import AuthLayout, { colors, fonts } from "@/components/auth/AuthLayout";
import AuthInput, { AuthButton, AuthError } from "@/components/auth/AuthInput";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const sb = getSupabase();
    if (!sb) {
      setError("Servicio de autenticación no disponible.");
      setSubmitting(false);
      return;
    }

    const { error: resetError } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    setSubmitting(false);

    if (resetError) {
      setError(getAuthErrorMessage(resetError.message));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout
        title="Revisa tu correo"
        subtitle={`Hemos enviado instrucciones a ${email}`}
        heading="Recupera tu acceso."
        headingAccent="Solo un paso más."
      >
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: colors.tealGlow,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              fontSize: "2rem",
            }}
          >
            ✉️
          </div>
          <p
            style={{
              color: colors.muted,
              fontSize: 14,
              lineHeight: 1.6,
              fontFamily: fonts.sans,
              marginBottom: 24,
            }}
          >
            Haz click en el enlace para restablecer tu contraseña.
            <br />
            Si no lo ves, revisa la carpeta de spam.
          </p>
          <Link
            href="/login"
            style={{
              color: colors.teal,
              textDecoration: "none",
              fontSize: 14,
              fontFamily: fonts.sans,
              fontWeight: 600,
            }}
          >
            ← Volver a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Te enviaremos un enlace para restablecerla"
      heading="Recupera tu acceso."
      headingAccent="Solo un paso más."
    >
      <form onSubmit={handleSubmit}>
        <AuthError message={error} />
        <AuthInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          placeholder="tu@empresa.com"
        />
        <AuthButton type="submit" loading={submitting}>
          Enviar enlace
        </AuthButton>
      </form>
      <p
        style={{
          marginTop: 24,
          fontSize: 14,
          color: colors.muted,
          fontFamily: fonts.sans,
          textAlign: "center",
        }}
      >
        <Link href="/login" style={{ color: colors.teal, textDecoration: "none", fontWeight: 600 }}>
          ← Volver a iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
