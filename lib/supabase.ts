import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const globalForSupabase = globalThis as unknown as {
  supabaseAdmin: SupabaseClient | undefined;
};

/**
 * Server-side Supabase client with service role privileges.
 * Use for admin operations: JWT verification, user management, etc.
 */
export function createServerClient(): SupabaseClient {
  if (globalForSupabase.supabaseAdmin) {
    return globalForSupabase.supabaseAdmin;
  }

  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalForSupabase.supabaseAdmin = client;
  }

  return client;
}

/**
 * Browser-side Supabase configuration.
 * Use in client components via createBrowserSupabaseClient().
 */
export const browserConfig = {
  supabaseUrl,
  supabaseAnonKey,
} as const;

export function createBrowserSupabaseClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey);
}
