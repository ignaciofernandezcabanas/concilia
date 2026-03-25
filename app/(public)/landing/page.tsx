/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─── Design System ───
const colors = {
  midnight: "#0f1923",
  deep: "#162231",
  slate: "#1e2d3d",
  steel: "#2a3f52",
  muted: "#6b8299",
  silver: "#94a3b8",
  cloud: "#cbd5e1",
  snow: "#f1f5f9",
  white: "#ffffff",
  teal: "#0d9488",
  tealLight: "#14b8a6",
  tealDark: "#0f766e",
  tealGlow: "rgba(13,148,136,0.15)",
  amber: "#f59e0b",
  red: "#ef4444",
  green: "#22c55e",
};

// ─── Navigation ───
function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    background: scrolled ? "rgba(15,25,35,0.95)" : "transparent",
    backdropFilter: scrolled ? "blur(20px)" : "none",
    borderBottom: scrolled ? `1px solid ${colors.steel}` : "none",
    transition: "all 0.3s ease",
    padding: "0 24px",
  };

  const links = [
    { label: "Cómo funciona", href: "#como-funciona" },
    { label: "Beneficios", href: "#beneficios" },
    { label: "Calculadora", href: "#calculadora" },
    { label: "Precios", href: "#pricing" },
  ];

  return (
    <nav style={navStyle}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${colors.teal}, ${colors.tealDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Instrument Serif', serif",
              fontSize: 20,
              color: colors.white,
              fontWeight: 400,
            }}
          >
            C
          </div>
          <span
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 24,
              color: colors.white,
              letterSpacing: "-0.02em",
            }}
          >
            Concilia
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 32 }} className="nav-desktop">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                color: colors.silver,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e: any) => (e.target.style.color = colors.white)}
              onMouseLeave={(e: any) => (e.target.style.color = colors.silver)}
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/login"
            style={{
              background: "none",
              border: `1px solid ${colors.steel}`,
              color: colors.cloud,
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 14,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Iniciar sesión
          </Link>
          <Link
            href="/signup"
            style={{
              background: colors.teal,
              border: "none",
              color: colors.white,
              padding: "8px 24px",
              borderRadius: 8,
              fontSize: 14,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: `0 0 20px ${colors.tealGlow}`,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Prueba gratis
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ───
function Hero() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(180deg, ${colors.midnight} 0%, ${colors.deep} 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(${colors.steel} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          opacity: 0.15,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-20%",
          right: "-10%",
          width: 600,
          height: 600,
          background: `radial-gradient(circle, ${colors.tealGlow} 0%, transparent 70%)`,
          borderRadius: "50%",
        }}
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "120px 24px 80px",
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 64,
          alignItems: "center",
        }}
      >
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: colors.tealGlow,
              border: `1px solid rgba(13,148,136,0.3)`,
              borderRadius: 100,
              padding: "6px 16px",
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: colors.teal,
                animation: "pulse 2s infinite",
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: colors.tealLight,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 600,
              }}
            >
              Agente activo 24/7
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "clamp(36px, 5vw, 60px)",
              color: colors.white,
              lineHeight: 1.1,
              marginBottom: 24,
              letterSpacing: "-0.02em",
            }}
          >
            Deja de puntear.
            <br />
            <span style={{ color: colors.teal }}>Empieza a controlar.</span>
          </h1>

          <p
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 18,
              color: colors.silver,
              lineHeight: 1.7,
              marginBottom: 40,
              maxWidth: 480,
            }}
          >
            Concilia lee tus facturas, concilia tu banco y genera tus asientos. Tú solo apruebas.
          </p>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 48 }}>
            <a
              href="#calculadora"
              style={{
                background: colors.teal,
                color: colors.white,
                padding: "14px 32px",
                borderRadius: 10,
                fontSize: 16,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: `0 4px 24px rgba(13,148,136,0.4)`,
                transition: "all 0.2s",
              }}
            >
              Solicita una demo <span>→</span>
            </a>
            <a
              href="#como-funciona"
              style={{
                background: "transparent",
                color: colors.cloud,
                padding: "14px 32px",
                borderRadius: 10,
                fontSize: 16,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 600,
                textDecoration: "none",
                border: `1px solid ${colors.steel}`,
                transition: "all 0.2s",
              }}
            >
              Ver cómo funciona
            </a>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex" }}>
              {["M.R.", "A.L.", "C.P.", "J.G."].map((initials, i) => (
                <div
                  key={i}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: [colors.teal, colors.tealDark, colors.steel, colors.slate][i],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: colors.white,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    marginLeft: i > 0 ? -10 : 0,
                    border: `2px solid ${colors.midnight}`,
                    zIndex: 4 - i,
                  }}
                >
                  {initials}
                </div>
              ))}
            </div>
            <p
              style={{
                fontSize: 13,
                color: colors.muted,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Controllers en programa early adopter
            </p>
          </div>
        </div>

        {/* Agent visualization */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateX(0)" : "translateX(40px)",
            transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
          }}
        >
          <div
            style={{
              background: colors.deep,
              border: `1px solid ${colors.steel}`,
              borderRadius: 20,
              padding: 28,
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <div
                style={{ width: 10, height: 10, borderRadius: "50%", background: colors.teal }}
              />
              <span
                style={{
                  fontSize: 13,
                  color: colors.teal,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 600,
                }}
              >
                Agente trabajando — ahora
              </span>
            </div>

            {[
              {
                time: "08:01",
                action: "142 facturas procesadas del buzón",
                icon: "📨",
                status: "done",
              },
              {
                time: "08:03",
                action: "1.247 movimientos bancarios importados",
                icon: "🏦",
                status: "done",
              },
              {
                time: "08:05",
                action: "1.189 conciliaciones resueltas (95.3%)",
                icon: "✓",
                status: "done",
              },
              {
                time: "08:06",
                action: "89 asientos generados automáticamente",
                icon: "📋",
                status: "done",
              },
              {
                time: "08:07",
                action: "12 excepciones pendientes de tu revisión",
                icon: "👤",
                status: "pending",
              },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: i < 4 ? `1px solid rgba(42,63,82,0.5)` : "none",
                  opacity: 0.6 + (i < 4 ? 0.4 : 0),
                  animation: `fadeSlideIn 0.5s ease ${0.8 + i * 0.15}s both`,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    width: 40,
                    flexShrink: 0,
                  }}
                >
                  {item.time}
                </span>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: 14,
                    color: item.status === "pending" ? colors.amber : colors.cloud,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: item.status === "pending" ? 600 : 400,
                  }}
                >
                  {item.action}
                </span>
                {item.status === "done" && (
                  <span style={{ marginLeft: "auto", color: colors.green, fontSize: 16 }}>✓</span>
                )}
                {item.status === "pending" && (
                  <span
                    style={{
                      marginLeft: "auto",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: colors.amber,
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @media (max-width: 768px) {
          section > div > div:first-child { grid-column: 1 / -1 !important; }
          section > div { grid-template-columns: 1fr !important; }
          .nav-desktop { display: none !important; }
        }
      `}</style>
    </section>
  );
}

// ─── Pain Section ───
function PainSection() {
  const items = [
    { bad: "60h/mes punteando en Excel", good: "8h/mes revisando excepciones", icon: "⏱" },
    {
      bad: "Facturas acumulándose en el buzón",
      good: "Procesadas antes de que llegues",
      icon: "📨",
    },
    { bad: "Aging desactualizado 3 semanas", good: "Aging en tiempo real, siempre", icon: "📊" },
    { bad: "Cierre el día 20 (con suerte)", good: "Cierre en D+5", icon: "📅" },
    {
      bad: '"¿Dónde está la factura de X?"',
      good: "Clasificada, contabilizada, conciliada",
      icon: "🔍",
    },
    {
      bad: "Error en el 303 → complementaria",
      good: "Asientos correctos desde el día 1",
      icon: "⚠️",
    },
  ];

  return (
    <section style={{ background: colors.white, padding: "100px 24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          ¿Te suena esto?
        </h2>
        <p
          style={{
            textAlign: "center",
            color: colors.muted,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 17,
            marginBottom: 56,
            maxWidth: 500,
            margin: "0 auto 56px",
          }}
        >
          El 70% del tiempo de un controller se va en tareas mecánicas. Concilia se encarga de eso.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
            borderRadius: 16,
            overflow: "hidden",
            border: `1px solid ${colors.snow}`,
            boxShadow: "0 4px 40px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ background: "#fef2f2", padding: "24px 32px" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.red,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 20,
              }}
            >
              Sin Concilia
            </div>
            {items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: i < items.length - 1 ? "1px solid rgba(239,68,68,0.1)" : "none",
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: 15,
                    color: "#991b1b",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {item.bad}
                </span>
              </div>
            ))}
          </div>
          <div style={{ background: "#f0fdfa", padding: "24px 32px" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.tealDark,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 20,
              }}
            >
              Con Concilia
            </div>
            {items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: i < items.length - 1 ? "1px solid rgba(13,148,136,0.1)" : "none",
                }}
              >
                <span style={{ color: colors.teal, fontSize: 16, fontWeight: 700 }}>✓</span>
                <span
                  style={{
                    fontSize: 15,
                    color: colors.tealDark,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {item.good}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── How it works ───
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Conecta",
      desc: "Conecta tu banco (Open Banking PSD2) y tu buzón de facturas. 10 minutos de setup.",
      icon: "🔌",
    },
    {
      num: "02",
      title: "El agente trabaja",
      desc: "Concilia lee cada factura, la clasifica según PGC, busca el movimiento en tu banco y genera el asiento. Si algo no cuadra, te pregunta.",
      icon: "⚡",
    },
    {
      num: "03",
      title: "Tú decides",
      desc: "Revisas las excepciones, apruebas con un click, y el mes está cerrado. Tú tienes el control. Siempre.",
      icon: "✅",
    },
  ];

  return (
    <section id="como-funciona" style={{ background: colors.snow, padding: "100px 24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Tres pasos. Cero data entry.
        </h2>
        <p
          style={{
            textAlign: "center",
            color: colors.muted,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 17,
            marginBottom: 64,
          }}
        >
          De 60 horas manuales a 8 horas de revisión.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                background: colors.white,
                borderRadius: 16,
                padding: 36,
                position: "relative",
                border: `1px solid transparent`,
                transition: "all 0.3s",
                cursor: "default",
                boxShadow: "0 2px 16px rgba(0,0,0,0.04)",
              }}
              onMouseEnter={(e: any) => {
                e.currentTarget.style.borderColor = colors.teal;
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 8px 32px ${colors.tealGlow}`;
              }}
              onMouseLeave={(e: any) => {
                e.currentTarget.style.borderColor = "transparent";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 16px rgba(0,0,0,0.04)";
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 16 }}>{s.icon}</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: colors.teal,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                }}
              >
                PASO {s.num}
              </div>
              <h3
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: 24,
                  color: colors.midnight,
                  marginBottom: 12,
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 15,
                  color: colors.muted,
                  lineHeight: 1.7,
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

// ─── Features / Benefits ───
function Features() {
  const features = [
    {
      title: "Conciliación bancaria automática",
      desc: "20 escenarios de matching. Desde la factura perfecta hasta el cobro parcial con retención IRPF. Lo que a ti te lleva 2 minutos por línea, a Concilia le lleva 2 segundos.",
      metric: "2 seg",
      metricLabel: "por movimiento",
      icon: "🏦",
    },
    {
      title: "Procesamiento de facturas con IA",
      desc: "El agente lee tu buzón de facturas@, extrae datos del PDF, clasifica según PGC y crea el apunte. Tú recibes la factura ya contabilizada.",
      metric: "142",
      metricLabel: "facturas/día",
      icon: "📄",
    },
    {
      title: "Asientos automáticos por diferencias",
      desc: "Descuento pp → 706. Comisión bancaria → 626. Retención IRPF → 473. El agente sabe qué asiento corresponde a cada diferencia.",
      metric: "0",
      metricLabel: "asientos manuales",
      icon: "📋",
    },
    {
      title: "Aging siempre actualizado",
      desc: "¿Quién te debe? ¿Desde cuándo? ¿Cuánto? Actualizado en tiempo real, no cuando alguien se acuerde de abrir el Excel.",
      metric: "D+0",
      metricLabel: "siempre al día",
      icon: "📊",
    },
    {
      title: "Clarificación inteligente",
      desc: "Cuando no puede resolver algo, redacta un email, lo envía, lee la respuesta y actualiza la conciliación. Sin que tú intervengas.",
      metric: "0",
      metricLabel: "emails que redactar",
      icon: "✉️",
    },
  ];

  return (
    <section id="beneficios" style={{ background: colors.white, padding: "100px 24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Lo que hace Concilia por ti cada día
        </h2>
        <p
          style={{
            textAlign: "center",
            color: colors.muted,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 17,
            marginBottom: 64,
          }}
        >
          Cada feature existe para ahorrarte tiempo. Cada segundo cuenta el día 15.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 28,
                alignItems: "center",
                padding: "28px 32px",
                background: colors.snow,
                borderRadius: 16,
                border: "1px solid transparent",
                transition: "all 0.3s",
              }}
              onMouseEnter={(e: any) => {
                e.currentTarget.style.borderColor = "rgba(13,148,136,0.2)";
                e.currentTarget.style.background = "#f0fdfa";
              }}
              onMouseLeave={(e: any) => {
                e.currentTarget.style.borderColor = "transparent";
                e.currentTarget.style.background = colors.snow;
              }}
            >
              <div
                style={{
                  fontSize: 32,
                  width: 56,
                  height: 56,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: colors.white,
                  borderRadius: 14,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                {f.icon}
              </div>
              <div>
                <h3
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 17,
                    fontWeight: 700,
                    color: colors.midnight,
                    marginBottom: 6,
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 14,
                    color: colors.muted,
                    lineHeight: 1.6,
                  }}
                >
                  {f.desc}
                </p>
              </div>
              <div style={{ textAlign: "center", minWidth: 80 }}>
                <div
                  style={{
                    fontFamily: "'Instrument Serif', serif",
                    fontSize: 32,
                    color: colors.teal,
                    lineHeight: 1,
                  }}
                >
                  {f.metric}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: colors.muted,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    marginTop: 4,
                  }}
                >
                  {f.metricLabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Social Proof / UGC Reviews ───
function SocialProof() {
  const reviews = [
    {
      name: "María R.",
      role: "Controller",
      company: "Distribuciones Martínez",
      revenue: "€12M",
      text: "Antes cerraba el día 18. Ahora cierro el 5. Y me sobra tiempo para hacer el reporting que siempre quise hacer.",
      metric: "D+18 → D+5",
      stars: 5,
    },
    {
      name: "Andrés L.",
      role: "Resp. Administración",
      company: "Grupo Alimentaria Sur",
      revenue: "€28M",
      text: "Lo que más me sorprendió es que aprende solo. Las nóminas, el alquiler, los seguros... al segundo mes ya los conciliaba sin preguntarme.",
      metric: "95% auto",
      stars: 5,
    },
    {
      name: "Carmen P.",
      role: "Socia",
      company: "Gestoría Puente & Asociados",
      revenue: "180 clientes",
      text: "Con 3 auxiliares gestionábamos 80 empresas al límite. Con Concilia gestionamos 140 y mis auxiliares hacen revisión, no data entry.",
      metric: "80 → 140 empresas",
      stars: 5,
    },
    {
      name: "Javier G.",
      role: "CFO",
      company: "TechRetail Ibérica",
      revenue: "€41M",
      text: "El aging en tiempo real cambió nuestra gestión de cobros. Antes era un Excel que nadie actualizaba. Ahora es la primera pestaña que abro.",
      metric: "-40% morosidad",
      stars: 5,
    },
    {
      name: "Laura S.",
      role: "Controller",
      company: "Cadena Hostelera Norte",
      revenue: "€8M",
      text: "Tenía miedo de que se equivocara con las retenciones. Pero las operaciones de riesgo siempre me las pasa para aprobar. Cero sustos con el 303.",
      metric: "0 complementarias",
      stars: 5,
    },
    {
      name: "Diego M.",
      role: "Director Financiero",
      company: "Farma Distribución",
      revenue: "€35M",
      text: "1.800 facturas al mes de proveedores. Antes necesitaba 2 personas solo para eso. Ahora Concilia procesa el 90% y mi equipo valida el resto.",
      metric: "90% automático",
      stars: 5,
    },
  ];

  return (
    <section style={{ background: colors.midnight, padding: "100px 24px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ color: colors.amber, fontSize: 20 }}>
                ★
              </span>
            ))}
            <span
              style={{
                color: colors.silver,
                fontSize: 14,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginLeft: 8,
              }}
            >
              4.9/5 de media
            </span>
          </div>
        </div>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            color: colors.white,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Controllers que ya cierran diferente
        </h2>
        <p
          style={{
            textAlign: "center",
            color: colors.muted,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 15,
            marginBottom: 12,
          }}
        >
          <em style={{ color: colors.silver, fontStyle: "italic" }}>
            * Resultados estimados basados en análisis de procesos de cierre en PYMEs españolas de
            €5-50M. Nombres y empresas son representativos del perfil de early adopters.
          </em>
        </p>
        <p style={{ textAlign: "center", marginBottom: 56 }}>&nbsp;</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {reviews.map((r, i) => (
            <div
              key={i}
              style={{
                background: colors.deep,
                border: `1px solid ${colors.steel}`,
                borderRadius: 16,
                padding: 28,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                transition: "all 0.3s",
              }}
              onMouseEnter={(e: any) => {
                e.currentTarget.style.borderColor = colors.teal;
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e: any) => {
                e.currentTarget.style.borderColor = colors.steel;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div>
                <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} style={{ color: colors.amber, fontSize: 14 }}>
                      ★
                    </span>
                  ))}
                </div>
                <p
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 15,
                    color: colors.cloud,
                    lineHeight: 1.7,
                    marginBottom: 20,
                  }}
                >
                  &ldquo;{r.text}&rdquo;
                </p>
              </div>
              <div>
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: 14,
                        fontWeight: 700,
                        color: colors.white,
                      }}
                    >
                      {r.name}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: 13,
                        color: colors.muted,
                      }}
                    >
                      {r.role}, {r.company}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: 12,
                        color: colors.steel,
                      }}
                    >
                      ({r.revenue})
                    </div>
                  </div>
                  <div
                    style={{
                      background: colors.tealGlow,
                      border: `1px solid rgba(13,148,136,0.3)`,
                      borderRadius: 8,
                      padding: "6px 12px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Instrument Serif', serif",
                        fontSize: 16,
                        color: colors.teal,
                      }}
                    >
                      {r.metric}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 40,
            marginTop: 56,
            flexWrap: "wrap",
          }}
        >
          {["PSD2 / Enable Banking", "Cifrado AES-256", "RGPD Compliant", "ISO 27001*"].map(
            (badge, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: colors.teal, fontSize: 16 }}>🛡</span>
                <span
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 13,
                    color: colors.silver,
                  }}
                >
                  {badge}
                </span>
              </div>
            )
          )}
        </div>
        <p
          style={{
            textAlign: "center",
            color: colors.steel,
            fontSize: 11,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            marginTop: 12,
          }}
        >
          * Certificación en proceso
        </p>
      </div>
    </section>
  );
}

// ─── ROI Calculator ───
function ROICalculator() {
  const [invoices, setInvoices] = useState(300);
  const [movements, setMovements] = useState(800);
  const [accounts, setAccounts] = useState(4);

  const manualHoursInvoices = (invoices * 4) / 60;
  const manualHoursMovements = (movements * 2.5) / 60;
  const manualHoursExtra = accounts * 2;
  const totalManual = manualHoursInvoices + manualHoursMovements + manualHoursExtra;
  const withConcilia = totalManual * 0.2;
  const savedHours = totalManual - withConcilia;
  const savedEuros = savedHours * 22;
  const savedAnnual = savedEuros * 12;
  const fteEquivalent = (savedHours / 160).toFixed(1);

  const SliderInput = ({
    label,
    value,
    onChange,
    min,
    max,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
  }) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span
          style={{
            fontSize: 14,
            color: colors.midnight,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: colors.teal,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {value.toLocaleString()}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          height: 6,
          borderRadius: 3,
          appearance: "none",
          background: `linear-gradient(to right, ${colors.teal} ${((value - min) / (max - min)) * 100}%, ${colors.snow} ${((value - min) / (max - min)) * 100}%)`,
          outline: "none",
          cursor: "pointer",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: colors.silver }}>{min}</span>
        <span style={{ fontSize: 11, color: colors.silver }}>{max}</span>
      </div>
    </div>
  );

  return (
    <section id="calculadora" style={{ background: colors.snow, padding: "100px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          ¿Cuánto tiempo estás regalando al data entry?
        </h2>
        <p
          style={{
            textAlign: "center",
            color: colors.muted,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 17,
            marginBottom: 56,
          }}
        >
          Mueve los sliders y calcula tu ahorro real.
        </p>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}
        >
          <div
            style={{
              background: colors.white,
              borderRadius: 20,
              padding: 36,
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}
          >
            <h3
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 16,
                fontWeight: 700,
                color: colors.midnight,
                marginBottom: 28,
              }}
            >
              Tu volumen mensual
            </h3>
            <SliderInput
              label="Facturas recibidas/mes"
              value={invoices}
              onChange={setInvoices}
              min={50}
              max={2000}
            />
            <SliderInput
              label="Movimientos bancarios/mes"
              value={movements}
              onChange={setMovements}
              min={100}
              max={3000}
            />
            <SliderInput
              label="Cuentas bancarias"
              value={accounts}
              onChange={setAccounts}
              min={1}
              max={15}
            />

            <div
              style={{
                marginTop: 12,
                padding: 16,
                background: colors.snow,
                borderRadius: 10,
                fontSize: 12,
                color: colors.muted,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                lineHeight: 1.6,
              }}
            >
              <strong>Supuestos:</strong> 4 min/factura manual · 2.5 min/movimiento · €22/h coste
              medio · Concilia reduce el 80% del tiempo manual.
            </div>
          </div>

          <div>
            <div
              style={{
                background: `linear-gradient(135deg, ${colors.midnight}, ${colors.deep})`,
                borderRadius: 20,
                padding: 36,
                color: colors.white,
              }}
            >
              <h3
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.teal,
                  marginBottom: 24,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Tu ahorro con Concilia
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 12,
                    padding: 20,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Instrument Serif', serif",
                      fontSize: 36,
                      color: colors.red,
                    }}
                  >
                    {Math.round(totalManual)}h
                  </div>
                  <div style={{ fontSize: 12, color: colors.silver, marginTop: 4 }}>
                    horas manuales/mes
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 12,
                    padding: 20,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Instrument Serif', serif",
                      fontSize: 36,
                      color: colors.teal,
                    }}
                  >
                    {Math.round(withConcilia)}h
                  </div>
                  <div style={{ fontSize: 12, color: colors.silver, marginTop: 4 }}>
                    con Concilia
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: colors.tealGlow,
                  border: `1px solid rgba(13,148,136,0.3)`,
                  borderRadius: 14,
                  padding: 24,
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Instrument Serif', serif",
                    fontSize: 48,
                    color: colors.teal,
                  }}
                >
                  €{Math.round(savedAnnual).toLocaleString()}
                </div>
                <div style={{ fontSize: 14, color: colors.cloud, marginTop: 4 }}>
                  ahorro estimado al año
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderTop: `1px solid ${colors.steel}`,
                }}
              >
                <span style={{ fontSize: 14, color: colors.silver }}>Horas recuperadas/mes</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.teal }}>
                  {Math.round(savedHours)}h
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderTop: `1px solid ${colors.steel}`,
                }}
              >
                <span style={{ fontSize: 14, color: colors.silver }}>Equivalente en FTEs</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.teal }}>
                  {fteEquivalent} personas
                </span>
              </div>
            </div>

            <a
              href="#pricing"
              style={{
                display: "block",
                textAlign: "center",
                background: colors.teal,
                color: colors.white,
                padding: "16px 32px",
                borderRadius: 12,
                fontSize: 16,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                textDecoration: "none",
                marginTop: 20,
                boxShadow: `0 4px 24px rgba(13,148,136,0.3)`,
                transition: "all 0.2s",
              }}
            >
              Recupera {Math.round(savedHours)}h al mes → Solicita demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ───
function Pricing() {
  const tiers = [
    {
      name: "Controller Solo",
      desc: "Para PYMEs con 1 sociedad",
      price: "149",
      features: [
        "1 sociedad",
        "2-3 cuentas bancarias",
        "300 movimientos/mes",
        "150 facturas/mes",
        "Conciliación automática",
        "Procesamiento de facturas IA",
        "Aging en tiempo real",
      ],
      cta: "Empieza gratis 14 días",
      popular: false,
    },
    {
      name: "Departamento Financiero",
      desc: "Para empresas en crecimiento",
      price: "449",
      features: [
        "1-3 sociedades",
        "4-8 cuentas bancarias",
        "1.200 movimientos/mes",
        "500 facturas/mes",
        "Todo de Controller Solo",
        "Asientos automáticos por diferencias",
        "Clarificación inteligente por email",
        "Soporte prioritario",
      ],
      cta: "Empieza gratis 14 días",
      popular: true,
    },
    {
      name: "Grupo de Empresas",
      desc: "Para grupos y holdings",
      price: "899",
      features: [
        "4+ sociedades",
        "8+ cuentas bancarias",
        "Movimientos ilimitados",
        "Facturas ilimitadas",
        "Todo de Departamento",
        "Consolidación intercompañía",
        "Onboarding dedicado",
        "SLA personalizado",
      ],
      cta: "Habla con nosotros",
      popular: false,
    },
  ];

  return (
    <section id="pricing" style={{ background: colors.white, padding: "100px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Cuesta menos que un día de tu auxiliar al mes
        </h2>
        <p
          style={{
            textAlign: "center",
            color: colors.muted,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 17,
            marginBottom: 56,
          }}
        >
          Sin permanencia. Cancela cuando quieras. Sin sorpresas.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          {tiers.map((t, i) => (
            <div
              key={i}
              style={{
                background: t.popular
                  ? `linear-gradient(135deg, ${colors.midnight}, ${colors.deep})`
                  : colors.white,
                border: t.popular ? `2px solid ${colors.teal}` : `1px solid ${colors.snow}`,
                borderRadius: 20,
                padding: 36,
                position: "relative",
                boxShadow: t.popular
                  ? `0 8px 40px ${colors.tealGlow}`
                  : "0 2px 16px rgba(0,0,0,0.04)",
                transform: t.popular ? "scale(1.04)" : "scale(1)",
              }}
            >
              {t.popular && (
                <div
                  style={{
                    position: "absolute",
                    top: -14,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: colors.teal,
                    color: colors.white,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    padding: "5px 16px",
                    borderRadius: 100,
                    letterSpacing: "0.05em",
                  }}
                >
                  MÁS POPULAR
                </div>
              )}
              <h3
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  color: t.popular ? colors.white : colors.midnight,
                  marginBottom: 4,
                }}
              >
                {t.name}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: t.popular ? colors.silver : colors.muted,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  marginBottom: 20,
                }}
              >
                {t.desc}
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 28 }}>
                <span
                  style={{
                    fontFamily: "'Instrument Serif', serif",
                    fontSize: 48,
                    color: t.popular ? colors.teal : colors.midnight,
                  }}
                >
                  €{t.price}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: t.popular ? colors.silver : colors.muted,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  /mes
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {t.features.map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: colors.teal, fontSize: 14, fontWeight: 700 }}>✓</span>
                    <span
                      style={{
                        fontSize: 14,
                        color: t.popular ? colors.cloud : colors.muted,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                      }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href={t.popular ? "/signup" : i === 2 ? "#" : "/signup"}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "14px 24px",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "center",
                  textDecoration: "none",
                  background: t.popular ? colors.teal : "transparent",
                  color: t.popular ? colors.white : colors.teal,
                  border: t.popular ? "none" : `2px solid ${colors.teal}`,
                  boxSizing: "border-box",
                }}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: 32,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 15,
          }}
        >
          <Link
            href="/gestoria"
            style={{ color: colors.teal, textDecoration: "none", fontWeight: 600 }}
          >
            ¿Eres gestoría? Tenemos un plan específico para ti →
          </Link>
        </p>
      </div>
    </section>
  );
}

// ─── FAQ ───
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const items = [
    {
      q: "¿Es seguro conectar mi banco?",
      a: "La conexión es vía PSD2 (regulación europea de Open Banking) a través de Enable Banking. Concilia solo lee tus movimientos. No puede hacer transferencias ni modificar nada. Es acceso de solo lectura, como cuando tu gestoría consulta tu cuenta.",
    },
    {
      q: "¿Sustituye a mi gestoría?",
      a: "No. Tu gestoría hace compliance fiscal (modelos, cuentas anuales, libros oficiales). Concilia hace el trabajo mecánico previo: procesar facturas, conciliar banco, generar asientos. Le llega todo hecho a tu gestoría. Trabajan juntos, no compiten.",
    },
    {
      q: "¿Y si el agente se equivoca?",
      a: "Tú apruebas todo. El agente propone, tú decides. Las operaciones de riesgo (inversiones, CAPEX, operaciones inusuales) nunca se auto-aprueban: siempre requieren tu validación explícita.",
    },
    {
      q: "¿Funciona con mi ERP?",
      a: "Hoy Concilia se integra nativamente con Holded. Estamos trabajando en Sage, A3 y otros ERPs habituales en España. ¿Usas otro? Escríbenos y lo priorizamos.",
    },
    {
      q: "¿Puedo probarlo sin compromiso?",
      a: "Sí. 14 días gratis, sin tarjeta, sin permanencia. Si no te convence, cancelas y ya. Sin trucos.",
    },
    {
      q: "¿Cómo se instala?",
      a: "No se instala. Conectas tu banco y tu buzón de email en 10 minutos. No hay software que descargar, ni servidores que configurar, ni formación de 3 días.",
    },
  ];

  return (
    <section style={{ background: colors.snow, padding: "100px 24px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 40px)",
            color: colors.midnight,
            textAlign: "center",
            marginBottom: 56,
          }}
        >
          Preguntas que te estás haciendo
        </h2>

        {items.map((item, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${colors.cloud}`, overflow: "hidden" }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 0",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 16,
                  fontWeight: 600,
                  color: colors.midnight,
                }}
              >
                {item.q}
              </span>
              <span
                style={{
                  fontSize: 20,
                  color: colors.teal,
                  transform: open === i ? "rotate(45deg)" : "rotate(0)",
                  transition: "transform 0.3s",
                  flexShrink: 0,
                  marginLeft: 16,
                }}
              >
                +
              </span>
            </button>
            <div
              style={{
                maxHeight: open === i ? 200 : 0,
                overflow: "hidden",
                transition: "max-height 0.4s ease",
              }}
            >
              <p
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 15,
                  color: colors.muted,
                  lineHeight: 1.7,
                  paddingBottom: 20,
                }}
              >
                {item.a}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Final CTA ───
function FinalCTA() {
  return (
    <section
      style={{
        background: `linear-gradient(135deg, ${colors.midnight}, ${colors.deep})`,
        padding: "100px 24px",
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
          transform: "translate(-50%,-50%)",
          width: 600,
          height: 600,
          background: `radial-gradient(circle, ${colors.tealGlow} 0%, transparent 70%)`,
          borderRadius: "50%",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            color: colors.white,
            marginBottom: 16,
            lineHeight: 1.2,
          }}
        >
          Tu próximo cierre mensual puede ser el último que hagas en Excel.
        </h2>
        <p
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 18,
            color: colors.silver,
            marginBottom: 40,
          }}
        >
          Empieza hoy. En 10 minutos tienes el agente trabajando.
        </p>
        <Link
          href="/signup"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: colors.teal,
            color: colors.white,
            padding: "16px 40px",
            borderRadius: 12,
            fontSize: 18,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: `0 4px 32px rgba(13,148,136,0.4)`,
            transition: "all 0.2s",
          }}
        >
          Solicita una demo gratuita →
        </Link>
        <p
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 14,
            color: colors.muted,
            marginTop: 20,
          }}
        >
          14 días gratis · Sin tarjeta · Sin permanencia · Cancela cuando quieras
        </p>
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
          {["Producto", "Precios", "Para gestorías", "Blog", "Contacto"].map((l) => (
            <a
              key={l}
              href="#"
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
              {l}
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
          © 2026 Concilia. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}

// ─── Landing Page ───
export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0, padding: 0 }}>
      <Nav />
      <Hero />
      <PainSection />
      <HowItWorks />
      <Features />
      <SocialProof />
      <ROICalculator />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
