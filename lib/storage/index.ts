/**
 * Storage factory.
 *
 * Returns the appropriate storage or email provider based on the integration type.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { decryptJson } from "@/lib/crypto";
import { GoogleDriveProvider } from "./google-drive";
import { OneDriveProvider } from "./onedrive";
import type { StorageProvider } from "./types";

export type { StorageProvider, StorageFile, StorageFolder, UploadOptions } from "./types";
export type { EmailProvider, EmailMessage, EmailAttachment } from "./types";

/**
 * Gets the storage provider for a company based on its active integration.
 * Returns null if no storage integration is configured.
 */
export async function getStorageProvider(
  db: ScopedPrisma
): Promise<StorageProvider | null> {
  // Check for Google Drive integration
  const driveIntegration = await db.integration.findFirst({
    where: {
      type: "GOOGLE_DRIVE",
      status: "CONNECTED",
    },
    select: { config: true },
  });

  if (driveIntegration?.config) {
    const creds = decryptJson<{ access_token: string }>(String(driveIntegration.config));
    return new GoogleDriveProvider(creds.access_token);
  }

  // Check for OneDrive integration
  const onedriveIntegration = await db.integration.findFirst({
    where: {
      type: "ONEDRIVE",
      status: "CONNECTED",
    },
    select: { config: true },
  });

  if (onedriveIntegration?.config) {
    const creds = decryptJson<{ access_token: string }>(String(onedriveIntegration.config));
    return new OneDriveProvider(creds.access_token);
  }

  return null;
}
