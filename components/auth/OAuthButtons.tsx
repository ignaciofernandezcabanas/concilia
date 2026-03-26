/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/api-client";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import { colors, fonts } from "./AuthLayout";

interface OAuthButtonsProps {
  label?: string;
  onError?: (msg: string) => void;
}

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 24px",
  borderRadius: 10,
  border: `1px solid ${colors.steel}`,
  background: "transparent",
  color: colors.cloud,
  fontSize: 15,
  fontFamily: fonts.sans,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  transition: "all 0.2s",
};

export default function OAuthButtons({ label = "Continuar", onError }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "azure") {
    const sb = getSupabase();
    if (!sb) {
      onError?.("Servicio de autenticación no disponible.");
      return;
    }
    setLoadingProvider(provider);
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setLoadingProvider(null);
      onError?.(getAuthErrorMessage(error.message));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={!!loadingProvider}
        style={{ ...btnStyle, marginBottom: 12, opacity: loadingProvider ? 0.5 : 1 }}
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
        {loadingProvider === "google" ? "Conectando..." : `${label} con Google`}
      </button>

      <button
        type="button"
        onClick={() => handleOAuth("azure")}
        disabled={!!loadingProvider}
        style={{ ...btnStyle, marginBottom: 24, opacity: loadingProvider ? 0.5 : 1 }}
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
        {loadingProvider === "azure" ? "Conectando..." : `${label} con Microsoft`}
      </button>
    </>
  );
}
