import { test as base, expect, request as pwRequest } from "@playwright/test";
import * as fs from "fs";

/**
 * Extract the Supabase access token from the stored auth state.
 * The token is stored in localStorage under a key like `sb-<ref>-auth-token`.
 */
function getAccessToken(): string | null {
  try {
    const state = JSON.parse(fs.readFileSync("e2e/playwright/.auth/user.json", "utf-8"));
    for (const origin of state.origins || []) {
      for (const entry of origin.localStorage || []) {
        if (entry.name?.includes("auth-token")) {
          const parsed = JSON.parse(entry.value);
          return parsed?.access_token ?? null;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extended Playwright test with authenticated API request context.
 */
export const test = base.extend({
  request: async ({}, use) => {
    const token = getAccessToken();
    const ctx = await pwRequest.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect };
