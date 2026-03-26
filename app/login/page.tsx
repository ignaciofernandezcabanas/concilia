"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import AuthLayout, { colors, fonts } from "@/components/auth/AuthLayout";
import AuthInput, {
  AuthButton,
  AuthDivider,
  AuthError,
  AuthSuccess,
} from "@/components/auth/AuthInput";
import OAuthButtons from "@/components/auth/OAuthButtons";

function LoginContent() {
  const { signIn, session, loading, isConfigured } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const successMsg = params.get("message");

  // Already logged in
  if (!loading && session) {
    router.push("/");
    return null;
  }

  // Supabase not configured — show message instead of redirect loop
  if (!loading && !isConfigured) {
    return (
      <AuthLayout title="Servicio no disponible" subtitle="">
        <p style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 14 }}>
          El servicio de autenticación no está configurado. Contacta al administrador.
        </p>
      </AuthLayout>
    );
  }

  if (loading) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/");
    }
  }

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Accede a tu panel de controlling."
      heading="Bienvenido de vuelta."
      headingAccent="Tu agente te espera."
      bullets={[
        { icon: "📊", text: "Tu dashboard te espera con las últimas conciliaciones." },
        { icon: "🔔", text: "Revisa las excepciones pendientes de tu aprobación." },
        { icon: "📈", text: "Aging, tesorería y reporting actualizados al minuto." },
      ]}
    >
      <AuthSuccess message={successMsg} />
      <OAuthButtons label="Continuar" onError={(msg) => setError(msg)} />
      <AuthDivider />
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" }}>
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
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <div style={{ textAlign: "right", marginTop: -8, marginBottom: 16 }}>
          <Link
            href="/recuperar-contrasena"
            style={{
              fontSize: 13,
              color: colors.muted,
              textDecoration: "none",
              fontFamily: fonts.sans,
            }}
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <AuthButton type="submit" loading={submitting}>
          Iniciar sesión
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
        ¿No tienes cuenta?{" "}
        <Link
          href="/signup"
          style={{ color: colors.teal, textDecoration: "none", fontWeight: 600 }}
        >
          Regístrate gratis
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
