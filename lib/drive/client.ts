/**
 * Google Drive client using the googleapis SDK.
 *
 * Authenticates via OAuth2 with a stored refresh token and provides
 * methods for folder and file management.
 */

import { google, type drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  createdTime?: string;
}

export interface DriveClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const FOLDER_MIME = "application/vnd.google-apps.folder";

export class GoogleDriveClient {
  private drive: drive_v3.Drive;
  private auth: OAuth2Client;

  constructor(config: DriveClientConfig) {
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      throw new Error("GoogleDriveClient: clientId, clientSecret, and refreshToken are required");
    }

    this.auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    this.auth.setCredentials({ refresh_token: config.refreshToken });

    this.drive = google.drive({ version: "v3", auth: this.auth });
  }

  // -----------------------------------------------------------------------
  // Folder operations
  // -----------------------------------------------------------------------

  /**
   * Create a folder in Google Drive.
   * @param name     - Folder name.
   * @param parentId - ID of the parent folder (optional).
   * @returns The created folder metadata.
   */
  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: "id, name, mimeType, webViewLink, createdTime",
    });

    return mapDriveFile(response.data);
  }

  /**
   * Find a folder by name within an optional parent folder.
   * Returns the first match, or null if not found.
   */
  async getFolderByName(name: string, parentId?: string): Promise<DriveFile | null> {
    const parentClause = parentId ? ` and '${parentId}' in parents` : "";
    const query = `mimeType='${FOLDER_MIME}' and name='${escapeDriveQuery(name)}' and trashed=false${parentClause}`;

    const response = await this.drive.files.list({
      q: query,
      fields: "files(id, name, mimeType, webViewLink, createdTime)",
      pageSize: 1,
    });

    const files = response.data.files;
    if (!files || files.length === 0) return null;

    return mapDriveFile(files[0]);
  }

  /**
   * Get or create a folder by name within a parent.
   */
  async ensureFolder(name: string, parentId?: string): Promise<DriveFile> {
    const existing = await this.getFolderByName(name, parentId);
    if (existing) return existing;
    return this.createFolder(name, parentId);
  }

  // -----------------------------------------------------------------------
  // File operations
  // -----------------------------------------------------------------------

  /**
   * Upload a file to Google Drive.
   *
   * @param name     - File name (including extension).
   * @param content  - File contents as a Buffer.
   * @param mimeType - MIME type of the file (e.g. "application/pdf").
   * @param folderId - ID of the parent folder.
   * @returns The uploaded file metadata.
   */
  async uploadFile(
    name: string,
    content: Buffer,
    mimeType: string,
    folderId: string
  ): Promise<DriveFile> {
    const response = await this.drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(content),
      },
      fields: "id, name, mimeType, webViewLink, createdTime",
    });

    return mapDriveFile(response.data);
  }

  /**
   * List files in a folder (non-recursive, non-trashed).
   */
  async listFiles(folderId: string): Promise<DriveFile[]> {
    const allFiles: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "nextPageToken, files(id, name, mimeType, webViewLink, createdTime)",
        pageSize: 100,
        pageToken,
      });

      const files = response.data.files;
      if (files) {
        allFiles.push(...files.map(mapDriveFile));
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return allFiles;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapDriveFile(data: drive_v3.Schema$File): DriveFile {
  return {
    id: data.id ?? "",
    name: data.name ?? "",
    mimeType: data.mimeType ?? "",
    webViewLink: data.webViewLink ?? undefined,
    createdTime: data.createdTime ?? undefined,
  };
}

/**
 * Escape single quotes in a Drive API query string.
 */
function escapeDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}
