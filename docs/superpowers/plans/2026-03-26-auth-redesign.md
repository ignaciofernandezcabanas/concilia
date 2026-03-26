# Auth Redesign: Login, Signup, Onboarding, Password Reset

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken auth flows (signup, login, password reset, onboarding) so they work like a proper SaaS financial app — no loops, no swallowed errors, no broken redirects, with tour for new users.

**Architecture:** Supabase Auth (client-side SDK) + Next.js 14 App Router + server API routes with `withAuth`. Auth pages are client components outside `(app)` group. Onboarding is inside `(app)` but rendered without sidebar. A `isNewUser` flag on the User model triggers the tour on first dashboard load.

**Tech Stack:** Next.js 14, Supabase Auth, React, TypeScript, Prisma, Zod, Tailwind CSS

---

## Optimal Flow Design

### Signup (Email+Password)

```
/signup → Step 1: email+pass → Step 2: nombre+empresa
  → supabase.signUp()
  → /verificar-email (pantalla "revisa tu correo")
  → User clicks email link → /auth/callback
  → callback detects SIGNED_IN + no company → /onboarding
  → Onboarding complete → / (dashboard) + TOUR
```

### Signup (OAuth)

```
/signup → Click Google/Azure → Supabase OAuth
  → /auth/callback → SIGNED_IN
  → ¿Tiene empresa? No → /onboarding
  → Onboarding complete → / (dashboard) + TOUR
```

### Login

```
/login → email+pass or OAuth
  → Session established
  → AppShell: ¿Tiene empresa? Sí → dashboard | No → /onboarding
  → If new user (isNewUser=true) → TOUR
```

### Password Reset

```
/recuperar-contrasena → email input → "Revisa tu correo"
  → Click link → /auth/callback
  → callback detects PASSWORD_RECOVERY → /nueva-contrasena
  → User enters new password → supabase.updateUser({ password })
  → /login with success toast "Contraseña actualizada"
```

### Onboarding (3 steps)

```
Step 1: Empresa (nombre, CIF, moneda) — OBLIGATORIO
Step 2: Cuentas bancarias — OPCIONAL (skip allowed)
Step 3: Plan contable PGC — OPCIONAL (skip allowed)
  → POST /api/onboarding
  → refreshContext() → router.push("/")
  → Dashboard loads with TOUR (isNewUser=true)
```

---

## File Structure

### Files to CREATE

| File                                     | Responsibility                                             |
| ---------------------------------------- | ---------------------------------------------------------- |
| `app/(public)/verificar-email/page.tsx`  | "Check your email" screen after signup                     |
| `app/(public)/nueva-contrasena/page.tsx` | New password form after reset link click                   |
| `components/auth/AuthLayout.tsx`         | Shared layout for all auth pages (left panel + right form) |
| `components/auth/OAuthButtons.tsx`       | Shared Google + Azure OAuth buttons                        |
| `components/auth/AuthInput.tsx`          | Shared styled input for auth forms                         |

### Files to MODIFY

| File                                         | Changes                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `app/signup/page.tsx`                        | Rewrite: use shared components, redirect to /verificar-email, wrap in form   |
| `app/login/page.tsx`                         | Rewrite: use shared components, fix redirect loop, wrap in form              |
| `app/(public)/recuperar-contrasena/page.tsx` | Rewrite: use shared components                                               |
| `app/auth/callback/page.tsx`                 | Handle PASSWORD_RECOVERY event, proper cleanup, proper routing               |
| `app/(app)/onboarding/page.tsx`              | Fix bank accounts optional, add proper error handling                        |
| `app/api/onboarding/route.ts`                | Change bankAccounts to .min(0), add race condition guard, set isNewUser=true |
| `app/api/onboarding/add-company/route.ts`    | Change bankAccounts to .min(0)                                               |
| `app/api/auth/context/route.ts`              | Fix role ternary, validate company access on PUT                             |
| `components/AuthProvider.tsx`                | Don't swallow errors, handle session race                                    |
| `components/AppShell.tsx`                    | Fix 400 vs 401 handling for users without company                            |
| `lib/auth/middleware.ts`                     | Return 401 (not 400) for users without company                               |

### Prisma Schema Change

| File                   | Changes                                              |
| ---------------------- | ---------------------------------------------------- |
| `prisma/schema.prisma` | Add `isNewUser Boolean @default(true)` to User model |

---

## Task 1: Prisma schema — add isNewUser flag

**Files:**

- Modify: `prisma/schema.prisma` (User model)

- [ ] **Step 1: Add isNewUser field to User model**

In `prisma/schema.prisma`, find the `model User` block and add:

```prisma
isNewUser     Boolean   @default(true)
```

- [ ] **Step 2: Generate migration**

Run: `cd /Users/ignaciofernandez/Dev/concilia && npx prisma migrate dev --name add-user-is-new-user`
Expected: Migration created and applied

- [ ] **Step 3: Verify Prisma client**

Run: `npx prisma generate`
Expected: Prisma Client generated

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(auth): add isNewUser flag to User model for tour trigger"
```

---

## Task 2: Shared auth UI components

**Files:**

- Create: `components/auth/AuthLayout.tsx`
- Create: `components/auth/OAuthButtons.tsx`
- Create: `components/auth/AuthInput.tsx`

- [ ] **Step 1: Create AuthLayout — shared two-panel layout**

Create `components/auth/AuthLayout.tsx`. This extracts the duplicated left-panel + right-form pattern from login/signup/recovery pages.

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

const colors = {
  midnight: "#0f1923",
  deep: "#162231",
  steel: "#1e3044",
  accent: "#4dabf7",
  accentHover: "#74c0fc",
  muted: "#8899aa",
  text: "#c8d6e0",
  white: "#f0f4f8",
  border: "#243447",
  success: "#51cf66",
  error: "#ff6b6b",
};

export { colors };

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: colors.midnight,
        color: colors.text,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Left Panel */}
      <div
        style={{
          flex: "0 0 45%",
          background: `linear-gradient(135deg, ${colors.deep} 0%, ${colors.midnight} 100%)`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "3rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 400 }}>
          <Image
            src="/concilia-logo.svg"
            alt="Concilia"
            width={180}
            height={48}
            style={{ marginBottom: "2rem" }}
          />
          <h2
            style={{
              fontSize: "1.6rem",
              fontWeight: 700,
              color: colors.white,
              marginBottom: "1rem",
              lineHeight: 1.3,
            }}
          >
            Control financiero
            <br />
            automatizado
          </h2>
          <p style={{ color: colors.muted, fontSize: "0.95rem", lineHeight: 1.6 }}>
            Conciliación bancaria inteligente, reporting financiero y cierre contable para PYMEs
            españolas.
          </p>
          <div
            style={{ marginTop: "2.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {[
              "Conciliación automática con IA",
              "Reporting PGC integrado",
              "Multi-sociedad y consolidación",
            ].map((text) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: `${colors.accent}22`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: colors.accent, fontSize: "0.7rem" }}>✓</span>
                </div>
                <span style={{ color: colors.text, fontSize: "0.9rem" }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Background decoration */}
        <div
          style={{
            position: "absolute",
            top: "10%",
            right: "-15%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.accent}08 0%, transparent 70%)`,
          }}
        />
      </div>

      {/* Right Panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "3rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: colors.white,
              marginBottom: subtitle ? "0.5rem" : "2rem",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: colors.muted, fontSize: "0.9rem", marginBottom: "2rem" }}>
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create OAuthButtons — shared OAuth buttons**

Create `components/auth/OAuthButtons.tsx`:

```tsx
"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/api-client";
import { colors } from "./AuthLayout";

interface OAuthButtonsProps {
  label?: string; // "Continuar" or "Registrarse"
}

export default function OAuthButtons({ label = "Continuar" }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "azure") {
    const sb = getSupabase();
    if (!sb) return;
    setLoadingProvider(provider);
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setLoadingProvider(null);
  }

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem",
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.deep,
    color: colors.text,
    fontSize: "0.9rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    transition: "all 0.2s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={!!loadingProvider}
        style={buttonStyle}
      >
        {loadingProvider === "google" ? "Conectando..." : `${label} con Google`}
      </button>
      <button
        type="button"
        onClick={() => handleOAuth("azure")}
        disabled={!!loadingProvider}
        style={buttonStyle}
      >
        {loadingProvider === "azure" ? "Conectando..." : `${label} con Microsoft`}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create AuthInput — shared styled input**

Create `components/auth/AuthInput.tsx`:

```tsx
"use client";

import { colors } from "./AuthLayout";

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.deep,
  color: colors.white,
  fontSize: "0.9rem",
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  color: colors.muted,
  marginBottom: "0.4rem",
  fontWeight: 500,
};

export default function AuthInput({ label, ...props }: AuthInputProps) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={labelStyle}>{label}</label>
      <input
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = colors.accent)}
        onBlur={(e) => (e.target.style.borderColor = colors.border)}
        {...props}
      />
    </div>
  );
}

export function AuthButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      disabled={loading}
      style={{
        width: "100%",
        padding: "0.75rem",
        borderRadius: 8,
        border: "none",
        background: loading ? colors.steel : colors.accent,
        color: "#fff",
        fontSize: "0.95rem",
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        opacity: loading ? 0.7 : 1,
      }}
      {...props}
    >
      {loading ? "Cargando..." : children}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        margin: "1.5rem 0",
      }}
    >
      <div style={{ flex: 1, height: 1, background: colors.border }} />
      <span style={{ color: colors.muted, fontSize: "0.8rem" }}>o</span>
      <div style={{ flex: 1, height: 1, background: colors.border }} />
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        borderRadius: 8,
        background: `${colors.error}15`,
        border: `1px solid ${colors.error}30`,
        color: colors.error,
        fontSize: "0.85rem",
        marginBottom: "1rem",
      }}
    >
      {message}
    </div>
  );
}

export function AuthSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        borderRadius: 8,
        background: `${colors.success}15`,
        border: `1px solid ${colors.success}30`,
        color: colors.success,
        fontSize: "0.85rem",
        marginBottom: "1rem",
      }}
    >
      {message}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/auth/
git commit -m "feat(auth): extract shared auth UI components (AuthLayout, OAuthButtons, AuthInput)"
```

---

## Task 3: Rewrite Signup page

**Files:**

- Modify: `app/signup/page.tsx` (full rewrite)
- Create: `app/(public)/verificar-email/page.tsx`

- [ ] **Step 1: Create verificar-email page**

Create `app/(public)/verificar-email/page.tsx`:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AuthLayout, { colors } from "@/components/auth/AuthLayout";
import { AuthButton } from "@/components/auth/AuthInput";
import Link from "next/link";

function VerificarEmailContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "tu correo";

  return (
    <AuthLayout
      title="Revisa tu correo"
      subtitle={`Hemos enviado un enlace de verificación a ${email}`}
    >
      <div style={{ textAlign: "center", padding: "2rem 0" }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: `${colors.accent}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            fontSize: "2rem",
          }}
        >
          ✉️
        </div>
        <p
          style={{
            color: colors.muted,
            fontSize: "0.9rem",
            lineHeight: 1.6,
            marginBottom: "1.5rem",
          }}
        >
          Haz click en el enlace del email para activar tu cuenta.
          <br />
          Si no lo encuentras, revisa la carpeta de spam.
        </p>
        <Link
          href="/login"
          style={{ color: colors.accent, textDecoration: "none", fontSize: "0.9rem" }}
        >
          Volver a iniciar sesión
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
```

- [ ] **Step 2: Rewrite signup page**

Rewrite `app/signup/page.tsx` with:

- Proper `<form>` tags (Enter key works)
- `required` attributes on inputs
- Redirect to `/verificar-email?email=X` after signup (not `/`)
- Use shared components (AuthLayout, OAuthButtons, AuthInput)
- Keep 2-step flow: Step 1 (email+pass) → Step 2 (name+company)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/api-client";
import { useAuth } from "@/components/AuthProvider";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import AuthLayout, { colors } from "@/components/auth/AuthLayout";
import AuthInput, { AuthButton, AuthDivider, AuthError } from "@/components/auth/AuthInput";
import OAuthButtons from "@/components/auth/OAuthButtons";

export default function SignupPage() {
  const router = useRouter();
  const { session, loading, isConfigured } = useAuth();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already logged in, go to dashboard
  if (!loading && session) {
    router.push("/");
    return null;
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(2);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const sb = getSupabase();
    if (!sb) {
      setError("Servicio de autenticación no disponible.");
      setSubmitting(false);
      return;
    }

    const { error: signUpError } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, company_name: company },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setSubmitting(false);

    if (signUpError) {
      setError(getAuthErrorMessage(signUpError.message));
      return;
    }

    // Redirect to email verification screen
    router.push(`/verificar-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <AuthLayout
      title={step === 1 ? "Crea tu cuenta" : "Datos de tu empresa"}
      subtitle={
        step === 1
          ? "Empieza a automatizar tu conciliación bancaria"
          : "Necesitamos algunos datos para configurar tu espacio"
      }
    >
      {step === 1 && (
        <>
          <OAuthButtons label="Registrarse" />
          <AuthDivider />
          <form onSubmit={handleStep1}>
            <AuthError message={error} />
            <AuthInput
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
            <AuthInput
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
            <AuthButton type="submit">Continuar</AuthButton>
          </form>
          <p
            style={{
              textAlign: "center",
              marginTop: "1.5rem",
              fontSize: "0.85rem",
              color: colors.muted,
            }}
          >
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" style={{ color: colors.accent, textDecoration: "none" }}>
              Inicia sesión
            </Link>
          </p>
        </>
      )}

      {step === 2 && (
        <form onSubmit={handleSignup}>
          <AuthError message={error} />
          <AuthInput
            label="Tu nombre"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            autoComplete="name"
          />
          <AuthInput
            label="Nombre de tu empresa"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            placeholder="Ej: Distribuciones García S.L."
          />
          <AuthButton type="submit" loading={submitting}>
            Crear cuenta
          </AuthButton>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setError(null);
            }}
            style={{
              width: "100%",
              marginTop: "0.75rem",
              padding: "0.75rem",
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              color: colors.muted,
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            ← Volver
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/signup/page.tsx app/\(public\)/verificar-email/
git commit -m "feat(auth): rewrite signup with email verification screen and shared components"
```

---

## Task 4: Rewrite Login page

**Files:**

- Modify: `app/login/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite login page**

Rewrite `app/login/page.tsx` using shared components. Fix: no redirect loop when !isConfigured, proper form, clean error handling.

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import AuthLayout, { colors } from "@/components/auth/AuthLayout";
import AuthInput, {
  AuthButton,
  AuthDivider,
  AuthError,
  AuthSuccess,
} from "@/components/auth/AuthInput";
import OAuthButtons from "@/components/auth/OAuthButtons";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, session, loading, isConfigured } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const successMsg = params.get("message"); // e.g., "Contraseña actualizada correctamente"

  // Already logged in
  if (!loading && session) {
    router.push("/");
    return null;
  }

  // Supabase not configured — show message instead of redirect loop
  if (!loading && !isConfigured) {
    return (
      <AuthLayout title="Servicio no disponible">
        <p style={{ color: colors.muted }}>
          El servicio de autenticación no está configurado. Contacta al administrador.
        </p>
      </AuthLayout>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn(email, password);
    setSubmitting(false);

    if (result.error) {
      setError(getAuthErrorMessage(result.error));
      return;
    }

    router.push("/");
  }

  return (
    <AuthLayout title="Inicia sesión" subtitle="Accede a tu panel de control financiero">
      <AuthSuccess message={successMsg} />
      <OAuthButtons label="Continuar" />
      <AuthDivider />
      <form onSubmit={handleSubmit}>
        <AuthError message={error} />
        <AuthInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />
        <AuthInput
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <div style={{ textAlign: "right", marginBottom: "1rem" }}>
          <Link
            href="/recuperar-contrasena"
            style={{ color: colors.accent, textDecoration: "none", fontSize: "0.85rem" }}
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <AuthButton type="submit" loading={submitting}>
          Iniciar sesión
        </AuthButton>
      </form>
      <p
        style={{
          textAlign: "center",
          marginTop: "1.5rem",
          fontSize: "0.85rem",
          color: colors.muted,
        }}
      >
        ¿No tienes cuenta?{" "}
        <Link href="/signup" style={{ color: colors.accent, textDecoration: "none" }}>
          Regístrate gratis
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat(auth): rewrite login with shared components, fix redirect loop"
```

---

## Task 5: Rewrite Password Reset flow

**Files:**

- Modify: `app/(public)/recuperar-contrasena/page.tsx` (rewrite)
- Create: `app/(public)/nueva-contrasena/page.tsx`
- Modify: `app/auth/callback/page.tsx` (handle PASSWORD_RECOVERY)

- [ ] **Step 1: Rewrite recuperar-contrasena page**

Rewrite `app/(public)/recuperar-contrasena/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/api-client";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import AuthLayout, { colors } from "@/components/auth/AuthLayout";
import AuthInput, { AuthButton, AuthError } from "@/components/auth/AuthInput";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const sb = getSupabase();
    if (!sb) {
      setError("Servicio de autenticación no disponible.");
      setSubmitting(false);
      return;
    }

    const { error: resetError } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    setSubmitting(false);

    if (resetError) {
      setError(getAuthErrorMessage(resetError.message));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout title="Revisa tu correo" subtitle={`Hemos enviado instrucciones a ${email}`}>
        <div style={{ textAlign: "center", padding: "2rem 0" }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: `${colors.accent}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
              fontSize: "2rem",
            }}
          >
            ✉️
          </div>
          <p
            style={{
              color: colors.muted,
              fontSize: "0.9rem",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}
          >
            Haz click en el enlace para restablecer tu contraseña.
            <br />
            Si no lo ves, revisa la carpeta de spam.
          </p>
          <Link
            href="/login"
            style={{ color: colors.accent, textDecoration: "none", fontSize: "0.9rem" }}
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un enlace para restablecerla">
      <form onSubmit={handleSubmit}>
        <AuthError message={error} />
        <AuthInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />
        <AuthButton type="submit" loading={submitting}>
          Enviar enlace
        </AuthButton>
      </form>
      <p
        style={{
          textAlign: "center",
          marginTop: "1.5rem",
          fontSize: "0.85rem",
          color: colors.muted,
        }}
      >
        <Link href="/login" style={{ color: colors.accent, textDecoration: "none" }}>
          ← Volver a iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Create nueva-contrasena page**

Create `app/(public)/nueva-contrasena/page.tsx`:

```tsx
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
    <AuthLayout title="Nueva contraseña" subtitle="Introduce tu nueva contraseña">
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
        />
        <AuthButton type="submit" loading={submitting}>
          Guardar contraseña
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 3: Rewrite auth/callback to handle PASSWORD_RECOVERY**

Rewrite `app/auth/callback/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/api-client";
import AuthLayout, { colors } from "@/components/auth/AuthLayout";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setError("Servicio de autenticación no disponible.");
      return;
    }

    let timeoutId: NodeJS.Timeout;

    // Listen for auth events
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        // User clicked password reset link → send to new password form
        clearTimeout(timeoutId);
        subscription.unsubscribe();
        router.replace("/nueva-contrasena");
        return;
      }

      if (event === "SIGNED_IN" && session) {
        clearTimeout(timeoutId);
        subscription.unsubscribe();
        router.replace("/");
        return;
      }
    });

    // Also check if session is already established (e.g., page reload)
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        router.replace("/");
      }
    });

    // Timeout after 15s
    timeoutId = setTimeout(() => {
      subscription.unsubscribe();
      setError("La verificación ha expirado. Inténtalo de nuevo.");
    }, 15000);

    // Cleanup on unmount
    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [router]);

  if (error) {
    return (
      <AuthLayout title="Error de verificación">
        <p style={{ color: colors.error, marginBottom: "1.5rem" }}>{error}</p>
        <a href="/login" style={{ color: colors.accent, textDecoration: "none" }}>
          Volver a iniciar sesión
        </a>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verificando...">
      <div style={{ textAlign: "center", padding: "2rem 0" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: `3px solid ${colors.border}`,
            borderTopColor: colors.accent,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 1rem",
          }}
        />
        <p style={{ color: colors.muted }}>Procesando tu solicitud...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(public\)/recuperar-contrasena/ app/\(public\)/nueva-contrasena/ app/auth/callback/
git commit -m "feat(auth): complete password reset flow with nueva-contrasena page and proper callback handling"
```

---

## Task 6: Fix Onboarding API + Page

**Files:**

- Modify: `app/api/onboarding/route.ts`
- Modify: `app/api/onboarding/add-company/route.ts`
- Modify: `app/(app)/onboarding/page.tsx`

- [ ] **Step 1: Fix onboarding API — bankAccounts optional + isNewUser + race condition**

In `app/api/onboarding/route.ts`:

1. Change `bankAccounts` schema from `.min(1)` to `.min(0).default([])`:

```typescript
// OLD:
bankAccounts: z.array(...).min(1, "Al menos una cuenta bancaria es requerida"),
// NEW:
bankAccounts: z.array(z.object({
  iban: z.string().min(1),
  bankName: z.string().optional(),
  alias: z.string().optional(),
})).min(0).default([]),
```

2. Replace the non-atomic duplicate check with a unique constraint approach — use `upsert` or catch Prisma unique constraint error. At minimum, move the check inside the transaction:

```typescript
// Move existingUser check INSIDE $transaction
const result = await prisma.$transaction(async (tx) => {
  const existingUser = await tx.user.findFirst({
    where: { email: supabaseUser.email!, status: "ACTIVE" },
  });
  if (existingUser) {
    throw new Error("ALREADY_EXISTS");
  }
  // ... rest of creation
});
```

3. Set `isNewUser: true` on user creation (already default from schema, but be explicit):

```typescript
const user = await tx.user.create({
  data: {
    // ... existing fields
    isNewUser: true,
  },
});
```

- [ ] **Step 2: Fix add-company API — bankAccounts optional**

In `app/api/onboarding/add-company/route.ts`, same change:

```typescript
bankAccounts: z.array(...).min(0).default([]),
```

- [ ] **Step 3: Fix onboarding page — proper error handling + Suspense**

In `app/(app)/onboarding/page.tsx`:

1. Wrap `useSearchParams()` usage in Suspense:

```tsx
import { Suspense } from "react";

function OnboardingContent() {
  const params = useSearchParams();
  // ... existing component logic
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}
```

2. Show API errors to user instead of silent failure — wrap `handleComplete` in try/catch with user-facing error:

```tsx
async function handleComplete() {
  setSubmitting(true);
  setError(null);
  try {
    // ... existing POST logic
    refreshContext();
    router.push("/");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al configurar la empresa.";
    setError(msg);
  } finally {
    setSubmitting(false);
  }
}
```

3. Make step 2 (bank accounts) genuinely optional — change "Saltar" button to call `setStep(3)` directly and remove minimum validation on the client side.

- [ ] **Step 4: Commit**

```bash
git add app/api/onboarding/ app/\(app\)/onboarding/
git commit -m "fix(auth): make bank accounts optional, fix race condition, show errors in onboarding"
```

---

## Task 7: Fix AuthProvider, AppShell, and middleware

**Files:**

- Modify: `components/AuthProvider.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `lib/auth/middleware.ts`
- Modify: `app/api/auth/context/route.ts`

- [ ] **Step 1: Fix AuthProvider — don't swallow errors**

In `components/AuthProvider.tsx`, replace the silent `.catch(() => {})` with actual error handling:

```typescript
// OLD:
.catch(() => {});

// NEW:
.catch((err) => {
  console.error("[AuthProvider] Failed to load context:", err);
  // Don't block the app — user can still navigate to onboarding
});
```

- [ ] **Step 2: Fix middleware — return 401 for no-company users**

In `lib/auth/middleware.ts`, change the no-company response from 400 to 401 so `api-client.ts` handles it correctly and redirects to onboarding:

```typescript
// OLD:
if (!company) {
  return NextResponse.json({ error: "No active company" }, { status: 400 });
}

// NEW:
if (!company) {
  return NextResponse.json({ error: "No active company. Complete onboarding." }, { status: 401 });
}
```

- [ ] **Step 3: Fix auth/context PUT — validate company access**

In `app/api/auth/context/route.ts`, validate that the user actually has access to the target company before switching:

```typescript
// After: const body = await req.json();
// ADD validation:
if (body.companyId) {
  // Check user has a membership with access to this company
  const hasAccess = await prisma.companyScope.findFirst({
    where: {
      companyId: body.companyId,
      membership: {
        userId: user.id,
        status: "ACTIVE",
      },
    },
  });
  if (!hasAccess) {
    return NextResponse.json({ error: "No tienes acceso a esta empresa." }, { status: 403 });
  }
}
```

- [ ] **Step 4: Fix role ternary**

In `app/api/auth/context/route.ts`, fix the meaningless ternary:

```typescript
// OLD:
role: m.role === "OWNER" ? "ADMIN" : "ADMIN",

// NEW:
role: m.role === "OWNER" ? "OWNER" : "ADMIN",
```

- [ ] **Step 5: Commit**

```bash
git add components/AuthProvider.tsx components/AppShell.tsx lib/auth/middleware.ts app/api/auth/context/route.ts
git commit -m "fix(auth): proper error handling in AuthProvider, 401 for no-company, validate company access, fix role ternary"
```

---

## Task 8: Add tour trigger for new users

**Files:**

- Modify: `components/AppShell.tsx`
- Modify: wherever the TourProvider reads whether to show tour

- [ ] **Step 1: Check current tour implementation**

Read the TourProvider component to understand how the tour is currently triggered. Likely uses localStorage or a flag.

- [ ] **Step 2: Wire isNewUser flag to tour trigger**

In AppShell or TourProvider, after loading user context, check if `isNewUser === true`:

- If true → start tour automatically
- After tour completes (or user dismisses) → call `PATCH /api/auth/context` to set `isNewUser: false`

Add to `app/api/auth/context/route.ts` GET response:

```typescript
// Add isNewUser to response
user: {
  // ... existing fields
  isNewUser: user.isNewUser,
},
```

Add PATCH handling or extend PUT to accept `isNewUser: false`:

```typescript
if (body.isNewUser === false) {
  await prisma.user.update({
    where: { id: user.id },
    data: { isNewUser: false },
  });
}
```

In AuthProvider, expose `isNewUser` from org context.

In AppShell/TourProvider, check `org.isNewUser` to auto-start tour.

- [ ] **Step 3: Commit**

```bash
git add components/ app/api/auth/context/
git commit -m "feat(auth): trigger tour for new users via isNewUser flag"
```

---

## Task 9: Cleanup — remove dead code from old auth pages

**Files:**

- Modify: `app/login/page.tsx` (already rewritten in Task 4)
- Modify: `app/signup/page.tsx` (already rewritten in Task 3)
- Modify: `app/(public)/recuperar-contrasena/page.tsx` (already rewritten in Task 5)

- [ ] **Step 1: Verify all pages use shared components and no duplicate styles remain**

Search for any remaining `colors =` or `inputStyle =` or `labelStyle =` in auth pages that should now use the shared components.

- [ ] **Step 2: Remove Google Fonts link tags from auth pages**

Add Inter font loading in root layout via `next/font` if not already present:

```tsx
// app/layout.tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });
// Use inter.className on <body> or <html>
```

Remove the `<link href="fonts.googleapis.com...">` tags from all auth pages.

- [ ] **Step 3: Final integration test — manually verify all flows**

Test each flow:

1. **Signup email+pass**: /signup → step1 → step2 → /verificar-email ✓
2. **Signup OAuth**: /signup → Google → /auth/callback → /onboarding ✓
3. **Login email+pass**: /login → credentials → / (dashboard) ✓
4. **Login OAuth**: /login → Google → /auth/callback → / ✓
5. **Password reset**: /recuperar-contrasena → email → link → /auth/callback → /nueva-contrasena → set password → /login with success ✓
6. **Onboarding**: /onboarding → step1 (empresa) → step2 (skip bank) → step3 (PGC) → / + tour ✓
7. **New user tour**: first login shows tour → dismiss → no more tour ✓

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "refactor(auth): cleanup dead code, add next/font, final polish"
```

---

## Execution Order & Dependencies

```
Task 1 (Prisma isNewUser) ← independent, do first
Task 2 (Shared components) ← independent, do first
  ↓
Task 3 (Signup rewrite) ← depends on Task 2
Task 4 (Login rewrite) ← depends on Task 2
Task 5 (Password reset) ← depends on Task 2
  ↓
Task 6 (Onboarding fixes) ← independent of 3-5
Task 7 (AuthProvider/middleware fixes) ← independent of 3-5
  ↓
Task 8 (Tour trigger) ← depends on Task 1 + Task 7
  ↓
Task 9 (Cleanup) ← depends on all above
```

**Parallelizable:** Tasks 1+2 in parallel, then 3+4+5+6+7 in parallel, then 8, then 9.
