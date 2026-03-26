"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/api-client";

const colors = {
  midnight: "#0f1923",
  teal: "#0d9488",
  steel: "#2a3f52",
  muted: "#6b8299",
  red: "#ef4444",
};

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setError("Servicio de autenticación no disponible.");
      return;
    }

    let cleaned = false;

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cleaned) return;

      if (event === "PASSWORD_RECOVERY") {
        cleaned = true;
        clearTimeout(tid);
        subscription.unsubscribe();
        router.replace("/nueva-contrasena");
        return;
      }

      if (event === "SIGNED_IN" && session) {
        cleaned = true;
        clearTimeout(tid);
        subscription.unsubscribe();
        router.replace("/");
        return;
      }
    });

    // Check if session already established
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session && !cleaned) {
        cleaned = true;
        clearTimeout(tid);
        subscription.unsubscribe();
        router.replace("/");
      }
    });

    // Timeout after 15s
    const tid = setTimeout(() => {
      if (!cleaned) {
        cleaned = true;
        subscription.unsubscribe();
        setError("La verificación ha expirado. Inténtalo de nuevo.");
      }
    }, 15000);

    // Cleanup on unmount
    return () => {
      cleaned = true;
      clearTimeout(tid);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.midnight,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        {error ? (
          <>
            <p style={{ color: colors.red, fontSize: 16, marginBottom: 24 }}>{error}</p>
            <a
              href="/login"
              style={{ color: colors.teal, textDecoration: "none", fontSize: 14, fontWeight: 600 }}
            >
              Volver a iniciar sesión
            </a>
          </>
        ) : (
          <>
            <div
              style={{
                width: 40,
                height: 40,
                border: `3px solid ${colors.steel}`,
                borderTopColor: colors.teal,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <p style={{ color: colors.muted, fontSize: 15 }}>Verificando...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  );
}
