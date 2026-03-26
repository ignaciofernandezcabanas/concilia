/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";

export const colors = {
  midnight: "#0f1923",
  deep: "#162231",
  steel: "#2a3f52",
  muted: "#6b8299",
  silver: "#94a3b8",
  cloud: "#cbd5e1",
  white: "#ffffff",
  teal: "#0d9488",
  tealLight: "#14b8a6",
  tealDark: "#0f766e",
  tealGlow: "rgba(13,148,136,0.15)",
  red: "#ef4444",
  green: "#22c55e",
};

export const fonts = {
  sans: "'Plus Jakarta Sans', sans-serif",
  serif: "'Instrument Serif', serif",
};

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  heading?: string;
  headingAccent?: string;
  bullets?: { icon: string; text: string }[];
}

const defaultBullets = [
  { icon: "📊", text: "Conciliación bancaria automática con IA." },
  { icon: "📋", text: "Reporting PGC integrado y cierre contable." },
  { icon: "🏢", text: "Multi-sociedad y consolidación." },
];

export default function AuthLayout({
  children,
  title,
  subtitle,
  heading = "Control financiero\nautomatizado.",
  headingAccent = "Tu agente te espera.",
  bullets = defaultBullets,
}: AuthLayoutProps) {
  const [mainHeading, ...rest] = heading.split("\n");

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          background: colors.midnight,
          position: "relative",
        }}
      >
        {/* Left decorative panel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "80px 64px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `radial-gradient(${colors.steel} 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
              opacity: 0.1,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-20%",
              left: "-10%",
              width: 500,
              height: 500,
              background: `radial-gradient(circle, ${colors.tealGlow} 0%, transparent 70%)`,
              borderRadius: "50%",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <Link
              href="/landing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 40,
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${colors.teal}, ${colors.tealDark})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: fonts.serif,
                  fontSize: 20,
                  color: colors.white,
                }}
              >
                C
              </div>
              <span
                style={{
                  fontFamily: fonts.serif,
                  fontSize: 24,
                  color: colors.white,
                  letterSpacing: "-0.02em",
                }}
              >
                Concilia
              </span>
            </Link>

            <h2
              style={{
                fontFamily: fonts.serif,
                fontSize: 40,
                color: colors.white,
                lineHeight: 1.2,
                marginBottom: 24,
              }}
            >
              {mainHeading}
              {rest.map((line, i) => (
                <span key={i}>
                  <br />
                  {line}
                </span>
              ))}
              {headingAccent && (
                <>
                  <br />
                  <span style={{ color: colors.teal }}>{headingAccent}</span>
                </>
              )}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 40 }}>
              {bullets.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span style={{ fontSize: 15, color: colors.cloud, fontFamily: fonts.sans }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div
          style={{
            width: 480,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 48px",
            background: colors.deep,
            borderLeft: `1px solid ${colors.steel}`,
          }}
        >
          <div style={{ width: "100%" }}>
            <h3
              style={{
                fontFamily: fonts.serif,
                fontSize: 28,
                color: colors.white,
                marginBottom: subtitle ? 8 : 32,
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                style={{
                  fontSize: 14,
                  color: colors.muted,
                  fontFamily: fonts.sans,
                  marginBottom: 32,
                }}
              >
                {subtitle}
              </p>
            )}
            {children}
          </div>
        </div>
      </section>
    </>
  );
}
