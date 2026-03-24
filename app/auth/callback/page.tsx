"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/api-client";

/**
 * OAuth callback page.
 *
 * Supabase redirects here after Google/Microsoft login.
 * The URL contains the auth code in the hash fragment,
 * which Supabase JS picks up automatically.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setError("Supabase no configurado.");
      return;
    }

    // Supabase handles the hash fragment automatically.
    // We just wait for the session to be established.
    sb.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      if (session) {
        router.push("/");
      } else {
        // Wait for onAuthStateChange to fire
        const {
          data: { subscription },
        } = sb.auth.onAuthStateChange((event, s) => {
          if (event === "SIGNED_IN" && s) {
            subscription.unsubscribe();
            router.push("/");
          }
        });

        // Timeout after 10s
        setTimeout(() => {
          subscription.unsubscribe();
          setError("Tiempo de espera agotado. Inténtalo de nuevo.");
        }, 10000);
      }
    });
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="bg-white rounded-lg border border-subtle p-8 w-full max-w-sm text-center">
          <p className="text-sm text-red-text mb-4">{error}</p>
          <button
            onClick={() => router.push("/login")}
            className="text-[13px] text-accent hover:underline"
          >
            Volver al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-text-secondary">Autenticando...</p>
      </div>
    </div>
  );
}
