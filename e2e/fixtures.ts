import { test as base, expect } from "@playwright/test";

/**
 * Extended Playwright test with authenticated context.
 * storageState is loaded automatically via playwright.config.ts.
 */
export const test = base;
export { expect };
