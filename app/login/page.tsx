"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { signIn, session, loading, isConfigured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // If already authenticated or auth not configured, go to dashboard
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

  if (loading) return null;
  if (!isConfigured) return null;

  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      <div className="bg-white rounded-lg border border-subtle p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-text-primary mb-1">Concilia</h1>
        <p className="text-sm text-text-secondary mb-6">
          Inicia sesión para continuar
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md focus:outline-none focus:border-accent"
              placeholder="tu@empresa.com"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md focus:outline-none focus:border-accent"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-9 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent-dark transition-colors disabled:opacity-50"
          >
            {submitting ? "Entrando..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
