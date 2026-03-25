/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";

const colors = {
  midnight: "#0f1923",
  deep: "#162231",
  steel: "#2a3f52",
  muted: "#6b8299",
  silver: "#94a3b8",
  cloud: "#cbd5e1",
  snow: "#f8fafc",
  white: "#ffffff",
  teal: "#0d9488",
  tealLight: "#14b8a6",
  tealDark: "#0f766e",
  tealGlow: "rgba(13,148,136,0.15)",
};

// ─── Nav ───
function Nav() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: `${colors.midnight}ee`,
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${colors.steel}`,
        padding: "0 24px",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
        }}
      >
        <Link
          href="/landing"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${colors.teal}, ${colors.tealDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Instrument Serif', serif",
              fontSize: 18,
              color: colors.white,
            }}
          >
            C
          </div>
          <span
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 20,
              color: colors.white,
              letterSpacing: "-0.02em",
            }}
          >
            Concilia
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link
            href="/login"
            style={{
              fontSize: 14,
              color: colors.silver,
              textDecoration: "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 500,
            }}
          >
            Iniciar sesión
          </Link>
          <Link
            href="/signup"
            style={{
              fontSize: 14,
              color: colors.white,
              background: colors.teal,
              padding: "8px 20px",
              borderRadius: 8,
              textDecoration: "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600,
            }}
          >
            Registrarse
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ───
function Hero() {
  return (
    <section
      style={{
        background: colors.midnight,
        padding: "140px 24px 100px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          height: 800,
          background: `radial-gradient(circle, ${colors.tealGlow} 0%, transparent 60%)`,
          borderRadius: "50%",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto" }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: 20,
            background: colors.tealGlow,
            border: `1px solid rgba(13,148,136,0.3)`,
            fontSize: 13,
            fontWeight: 600,
            color: colors.tealLight,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            marginBottom: 24,
          }}
        >
          Para gestorías y asesorías fiscales
        </div>
        <h1
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(36px, 5vw, 56px)",
            color: colors.white,
            lineHeight: 1.15,
            marginBottom: 20,
          }}
        >
          El portal fiscal
          <br />
          <span style={{ color: colors.teal }}>para tu gestoría</span>
        </h1>
        <p
          style={{
            fontSize: 18,
            color: colors.silver,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            lineHeight: 1.7,
            maxWidth: 600,
            margin: "0 auto 40px",
          }}
        >
          Colabora con tus clientes en la presentación de modelos fiscales. Alertas automáticas,
          borradores listos para revisar y documentación centralizada.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link
            href="/signup"
            style={{
              padding: "14px 32px",
              borderRadius: 10,
              background: colors.teal,
              color: colors.white,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            Empieza gratis
          </Link>
          <a
            href="mailto:hola@concilia.es"
            style={{
              padding: "14px 32px",
              borderRadius: 10,
              border: `2px solid ${colors.steel}`,
              color: colors.cloud,
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            Contactar
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Features ───
function Features() {
  const features = [
    {
      icon: "📅",
      title: "Calendario fiscal automático",
      desc: "Alertas de vencimiento para cada modelo tributario. Nunca más una presentación fuera de plazo.",
    },
    {
      icon: "📋",
      title: "Borradores listos para revisar",
      desc: "Modelos 303, 111, 115 y 390 pre-calculados a partir de los datos contables de tu cliente.",
    },
    {
      icon: "📤",
      title: "Subida de documentos",
      desc: "Portal centralizado para que tus clientes suban facturas, contratos y documentación fiscal.",
    },
    {
      icon: "🔔",
      title: "Gestión de incidencias",
      desc: "Registra y resuelve incidencias fiscales con trazabilidad completa. Todo queda documentado.",
    },
  ];

  return (
    <section style={{ background: colors.snow, padding: "100px 24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 40px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Todo lo que tu gestoría necesita
        </h2>
        <p
          style={{
            textAlign: "center",
            fontSize: 16,
            color: colors.muted,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            marginBottom: 60,
            maxWidth: 600,
            margin: "0 auto 60px",
          }}
        >
          Herramientas diseñadas para simplificar la colaboración fiscal entre gestoría y cliente.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 24,
          }}
        >
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                background: colors.white,
                borderRadius: 16,
                padding: 32,
                border: `1px solid #e2e8f0`,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 16 }}>{f.icon}</div>
              <h3
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 17,
                  fontWeight: 700,
                  color: colors.midnight,
                  marginBottom: 8,
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: colors.muted,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ───
function HowItWorks() {
  const steps = [
    {
      num: "1",
      title: "Configura",
      desc: "Conecta la gestoría con las empresas de tus clientes. Define qué modelos gestionas para cada uno.",
    },
    {
      num: "2",
      title: "Colabora",
      desc: "Revisa borradores fiscales, solicita documentación pendiente y gestiona incidencias desde un único portal.",
    },
    {
      num: "3",
      title: "Presenta",
      desc: "Modelos revisados y aprobados, listos para presentar. Con toda la documentación de respaldo.",
    },
  ];

  return (
    <section style={{ background: colors.white, padding: "100px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 40px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 60,
          }}
        >
          Cómo funciona
        </h2>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap", justifyContent: "center" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ flex: "1 1 240px", maxWidth: 280, textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: colors.tealGlow,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  color: colors.teal,
                  margin: "0 auto 16px",
                }}
              >
                {s.num}
              </div>
              <h3
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color: colors.midnight,
                  marginBottom: 8,
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: colors.muted,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ───
function FinalCTA() {
  return (
    <section
      style={{
        background: colors.midnight,
        padding: "80px 24px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 600,
          background: `radial-gradient(circle, ${colors.tealGlow} 0%, transparent 60%)`,
          borderRadius: "50%",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 40px)",
            color: colors.white,
            marginBottom: 16,
          }}
        >
          Simplifica la gestión fiscal de tus clientes
        </h2>
        <p
          style={{
            fontSize: 16,
            color: colors.silver,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            marginBottom: 32,
            lineHeight: 1.7,
          }}
        >
          Únete a las gestorías que ya usan Concilia para colaborar con sus clientes de forma
          eficiente.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link
            href="/signup"
            style={{
              padding: "14px 32px",
              borderRadius: 10,
              background: colors.teal,
              color: colors.white,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              textDecoration: "none",
            }}
          >
            Empieza gratis
          </Link>
          <a
            href="mailto:hola@concilia.es"
            style={{
              padding: "14px 32px",
              borderRadius: 10,
              border: `2px solid ${colors.steel}`,
              color: colors.cloud,
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              textDecoration: "none",
            }}
          >
            Contacta con nosotros
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───
function Footer() {
  return (
    <footer
      style={{
        background: colors.midnight,
        borderTop: `1px solid ${colors.steel}`,
        padding: "48px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 22,
              color: colors.white,
              marginBottom: 8,
            }}
          >
            Concilia
          </div>
          <p
            style={{
              fontSize: 13,
              color: colors.muted,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Tu agente de controlling. 24/7.
          </p>
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          {[
            { label: "Producto", href: "/landing#como-funciona" },
            { label: "Precios", href: "/landing#pricing" },
            { label: "Contacto", href: "mailto:hola@concilia.es" },
          ].map((l) => (
            <a
              key={l.label}
              href={l.href}
              style={{
                color: colors.silver,
                textDecoration: "none",
                fontSize: 14,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e: any) => (e.target.style.color = colors.white)}
              onMouseLeave={(e: any) => (e.target.style.color = colors.silver)}
            >
              {l.label}
            </a>
          ))}
        </div>
        <div
          style={{
            fontSize: 12,
            color: colors.steel,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          &copy; 2026 Concilia. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}

// ─── Page ───
export default function ParaGestoriasPage() {
  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0, padding: 0 }}>
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </div>
  );
}
