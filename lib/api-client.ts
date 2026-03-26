/**
 * Browser-side API client.
 * Attaches the Supabase JWT to every request.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Single shared Supabase instance for the browser
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

async function getToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { session },
  } = await sb.auth.getSession();
  return session?.access_token ?? null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    // Auto-redirect to login on 401 (expired/invalid token)
    if (res.status === 401 && typeof window !== "undefined") {
      const sb = getSupabase();
      if (sb) await sb.auth.signOut();
      window.location.href = "/login";
      throw new ApiError(401, "Session expired");
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText, body);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export const auth = {
  get supabase() {
    return getSupabase();
  },
  isConfigured: () => !!supabaseUrl && !!supabaseAnonKey,
  getSession: async () => {
    const sb = getSupabase();
    if (!sb) return { data: { session: null }, error: null };
    return sb.auth.getSession();
  },
  signIn: async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { data: null, error: { message: "Supabase no configurado" } };
    return sb.auth.signInWithPassword({ email, password });
  },
  signOut: async () => {
    const sb = getSupabase();
    if (!sb) return;
    return sb.auth.signOut();
  },
  onAuthStateChange: (
    cb: Parameters<NonNullable<ReturnType<typeof getSupabase>>["auth"]["onAuthStateChange"]>[0]
  ) => {
    const sb = getSupabase();
    if (!sb) return { data: { subscription: { unsubscribe: () => {} } } };
    return sb.auth.onAuthStateChange(cb);
  },
};
