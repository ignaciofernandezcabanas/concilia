"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/api-client";
import { useAuth } from "@/components/AuthProvider";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import AuthLayout, { colors, fonts } from "@/components/auth/AuthLayout";
import AuthInput, { AuthButton, AuthDivider, AuthError } from "@/components/auth/AuthInput";
import OAuthButtons from "@/components/auth/OAuthButtons";

export default function SignupPage() {
  const router = useRouter();
  const { session, loading, isConfigured } = useAuth();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already logged in
  if (!loading && session) {
    router.push("/");
    return null;
  }

  if (loading) return null;

  // Supabase not configured
  if (!isConfigured) {
    return (
      <AuthLayout title="Servicio no disponible" subtitle="">
        <p style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 14 }}>
          El servicio de autenticación no está configurado. Contacta al administrador.
        </p>
      </AuthLayout>
    );
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(2);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const sb = getSupabase();
    if (!sb) {
      setError("Servicio de autenticación no disponible.");
      setSubmitting(false);
      return;
    }

    const { error: signUpError } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, company_name: company },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setSubmitting(false);

    if (signUpError) {
      setError(getAuthErrorMessage(signUpError.message));
      return;
    }

    // Redirect to email verification screen (not "/")
    router.push(`/verificar-email?email=${encodeURIComponent(email)}`);
  }

  if (step === 1) {
    return (
      <AuthLayout
        title="Crea tu cuenta"
        subtitle="Empieza a automatizar tu conciliación bancaria"
        heading="Automatiza tu\nconciliación."
        headingAccent="Empieza en 2 minutos."
        bullets={[
          { icon: "⚡", text: "Setup en menos de 5 minutos." },
          { icon: "🤖", text: "IA que aprende de tus decisiones." },
          { icon: "📊", text: "Reporting PGC desde el día uno." },
        ]}
      >
        <OAuthButtons label="Registrarse" onError={(msg) => setError(msg)} />
        <AuthDivider />
        <form onSubmit={handleStep1}>
          <AuthError message={error} />
          <AuthInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            placeholder="tu@empresa.com"
          />
          <AuthInput
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
          />
          <AuthButton type="submit">Continuar</AuthButton>
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
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            style={{ color: colors.teal, textDecoration: "none", fontWeight: 600 }}
          >
            Inicia sesión
          </Link>
        </p>
      </AuthLayout>
    );
  }

  // Step 2: Name + Company
  return (
    <AuthLayout
      title="Datos de tu empresa"
      subtitle="Necesitamos algunos datos para configurar tu espacio"
      heading="Automatiza tu\nconciliación."
      headingAccent="Empieza en 2 minutos."
    >
      <form onSubmit={handleSignup}>
        <AuthError message={error} />
        <AuthInput
          label="Tu nombre"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          autoComplete="name"
          placeholder="Nombre y apellidos"
        />
        <AuthInput
          label="Nombre de tu empresa"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          required
          placeholder="Ej: Distribuciones García S.L."
        />
        <AuthButton type="submit" loading={submitting}>
          Crear cuenta
        </AuthButton>
        <button
          type="button"
          onClick={() => {
            setStep(1);
            setError(null);
          }}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "12px 24px",
            background: "transparent",
            border: `1px solid ${colors.steel}`,
            borderRadius: 10,
            color: colors.muted,
            cursor: "pointer",
            fontSize: 14,
            fontFamily: fonts.sans,
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          ← Volver
        </button>
      </form>
    </AuthLayout>
  );
}
