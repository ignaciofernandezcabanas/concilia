"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/api-client";

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
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  if (loading) return null;
  if (!isConfigured) return null;

  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      <div className="bg-white rounded-lg border border-subtle p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-text-primary mb-1">Concilia</h1>
        <p className="text-sm text-text-secondary mb-6">Inicia sesión para continuar</p>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-2 mb-5">
          <button
            onClick={() => handleOAuth("google")}
            className="h-10 w-full border border-subtle rounded-md text-[13px] font-medium text-text-primary hover:bg-hover transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continuar con Google
          </button>
          <button
            onClick={() => handleOAuth("azure")}
            className="h-10 w-full border border-subtle rounded-md text-[13px] font-medium text-text-primary hover:bg-hover transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Continuar con Microsoft
          </button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-subtle" />
          <span className="text-[11px] text-text-tertiary">o con email</span>
          <div className="flex-1 h-px bg-subtle" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Email</label>
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
            <label className="text-xs font-medium text-text-secondary block mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md focus:outline-none focus:border-accent"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded">{error}</p>}

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
