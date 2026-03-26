"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/api-client";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import AuthLayout from "@/components/auth/AuthLayout";
import AuthInput, { AuthButton, AuthError } from "@/components/auth/AuthInput";

export default function NuevaContrasenaPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setSubmitting(true);

    const sb = getSupabase();
    if (!sb) {
      setError("Servicio de autenticación no disponible.");
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await sb.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(getAuthErrorMessage(updateError.message));
      return;
    }

    // Sign out so user logs in fresh with new password
    await sb.auth.signOut();
    router.push("/login?message=" + encodeURIComponent("Contraseña actualizada correctamente"));
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      subtitle="Introduce tu nueva contraseña"
      heading="Restablece tu acceso."
      headingAccent="Elige una contraseña segura."
    >
      <form onSubmit={handleSubmit}>
        <AuthError message={error} />
        <AuthInput
          label="Nueva contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
        />
        <AuthInput
          label="Confirmar contraseña"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Repite la contraseña"
        />
        <AuthButton type="submit" loading={submitting}>
          Guardar contraseña
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
