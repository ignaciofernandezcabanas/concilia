/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Gestoría access helper.
 *
 * Checks if the current company has a GestoriaConfig and validates access level.
 * Used inside withAuth endpoints — no separate middleware needed.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

export interface GestoriaConfigData {
  id: string;
  companyId: string;
  gestoriaName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  accessLevel: string;
  manages: string[];
  lastAlertSentAt: Date | null;
  lastUploadAt: Date | null;
}

/**
 * Access level hierarchy: subir_docs < reportes < completo
 */
const ACCESS_HIERARCHY: Record<string, number> = {
  subir_docs: 1,
  reportes: 2,
  completo: 3,
};

/**
 * Check if the company has gestoría configured and if the access level is sufficient.
 *
 * @param db - Scoped Prisma client
 * @param requiredLevel - Minimum access level required (subir_docs | reportes | completo)
 * @returns GestoriaConfig if access granted, null otherwise
 */
export async function checkGestoriaAccess(
  db: ScopedPrisma,
  requiredLevel?: string
): Promise<GestoriaConfigData | null> {
  const config = await (db as any).gestoriaConfig?.findFirst?.();
  if (!config) return null;

  if (requiredLevel) {
    const configLevel = ACCESS_HIERARCHY[config.accessLevel] ?? 0;
    const required = ACCESS_HIERARCHY[requiredLevel] ?? 0;
    if (configLevel < required) return null;
  }

  return config as GestoriaConfigData;
}
