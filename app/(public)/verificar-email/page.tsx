"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthLayout, { colors, fonts } from "@/components/auth/AuthLayout";

function VerificarEmailContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "tu correo";

  return (
    <AuthLayout
      title="Revisa tu correo"
      subtitle={`Hemos enviado un enlace de verificación a ${email}`}
      heading="Casi listo."
      headingAccent="Solo falta un paso."
      bullets={[
        { icon: "✉️", text: "Abre el email que acabamos de enviarte." },
        { icon: "🔗", text: "Haz click en el enlace de verificación." },
        { icon: "🚀", text: "¡Y empieza a usar Concilia!" },
      ]}
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
          Si no lo encuentras, revisa la carpeta de spam.
          <br />
          El enlace expira en 24 horas.
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

export default function VerificarEmailPage() {
  return (
    <Suspense>
      <VerificarEmailContent />
    </Suspense>
  );
}
