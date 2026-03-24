"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { auth, api, getSupabase } from "@/lib/api-client";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

interface OrgContext {
  activeOrgId: string | null;
  activeCompanyId: string | null;
  /** User's name from our DB */
  userName: string | null;
  /** User's DB id */
  userId: string | null;
}

interface AuthState {
  session: Session | null;
  user: SupabaseUser | null;
  loading: boolean;
  isConfigured: boolean;
  org: OrgContext;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshContext: () => void;
}

const defaultOrg: OrgContext = {
  activeOrgId: null,
  activeCompanyId: null,
  userName: null,
  userId: null,
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  isConfigured: false,
  org: defaultOrg,
  signIn: async () => ({}),
  signOut: async () => {},
  refreshContext: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgContext>(defaultOrg);
  const [ctxTick, setCtxTick] = useState(0);
  const isConfigured = auth.isConfigured();

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }

    sb.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isConfigured]);

  // Load org context once authenticated
  useEffect(() => {
    if (!session) {
      setOrg(defaultOrg);
      return;
    }
    api
      .get<{
        user: {
          id: string;
          activeOrgId: string | null;
          activeCompanyId: string | null;
          name: string | null;
        };
      }>("/api/auth/context")
      .then((res) => {
        setOrg({
          activeOrgId: res.user.activeOrgId,
          activeCompanyId: res.user.activeCompanyId,
          userName: res.user.name,
          userId: res.user.id,
        });
      })
      .catch(() => {
        // Context endpoint may not exist yet or user has no memberships
      });
  }, [session, ctxTick]);

  const refreshContext = useCallback(() => setCtxTick((t) => t + 1), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { error: "Supabase no configurado" };
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setSession(null);
    setOrg(defaultOrg);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isConfigured,
        org,
        signIn,
        signOut,
        refreshContext,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
