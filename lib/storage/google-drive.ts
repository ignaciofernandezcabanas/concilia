/**
 * Google Drive storage provider.
 *
 * Implements StorageProvider using Google Drive API v3.
 * Requires OAuth2 credentials (access_token).
 */

import type { StorageProvider, StorageFile, StorageFolder, UploadOptions } from "./types";

const BASE_URL = "https://www.googleapis.com/drive/v3";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";

export class GoogleDriveProvider implements StorageProvider {
  readonly name = "google_drive" as const;

  constructor(private accessToken: string) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  async listFiles(folderId: string): Promise<StorageFile[]> {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetch(
      `${BASE_URL}/files?q=${q}&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)`,
      { headers: this.headers() }
    );
    if (!res.ok) throw new Error(`Drive listFiles failed: ${res.status}`);
    const data = await res.json();
    return (data.files ?? []).map(mapDriveFile);
  }

  async uploadFile(options: UploadOptions): Promise<StorageFile> {
    const metadata = JSON.stringify({
      name: options.fileName,
      parents: [options.folderId],
    });

    const boundary = "concilia_boundary";
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${options.mimeType}\r\n\r\n`;

    const parts = [
      new TextEncoder().encode(body),
      options.content,
      new TextEncoder().encode(`\r\n--${boundary}--`),
    ];
    const combined = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }

    const res = await fetch(
      `${UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink`,
      {
        method: "POST",
        headers: {
          ...this.headers(),
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: combined,
      }
    );

    if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
    return mapDriveFile(await res.json());
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const res = await fetch(`${BASE_URL}/files/${fileId}?alt=media`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/files/${fileId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Drive delete failed: ${res.status}`);
    }
  }

  async createFolder(parentId: string, name: string): Promise<StorageFolder> {
    const res = await fetch(`${BASE_URL}/files?fields=id,name,webViewLink`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    });
    if (!res.ok) throw new Error(`Drive createFolder failed: ${res.status}`);
    const data = await res.json();
    return { id: data.id, name: data.name, path: name, webUrl: data.webViewLink };
  }

  async ensureFolder(path: string): Promise<StorageFolder> {
    const parts = path.split("/").filter(Boolean);
    let parentId = "root";

    for (const part of parts) {
      const q = encodeURIComponent(
        `'${parentId}' in parents and name = '${part}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      const res = await fetch(`${BASE_URL}/files?q=${q}&fields=files(id,name)`, {
        headers: this.headers(),
      });
      const data = await res.json();

      if (data.files?.length > 0) {
        parentId = data.files[0].id;
      } else {
        const folder = await this.createFolder(parentId, part);
        parentId = folder.id;
      }
    }

    return { id: parentId, name: parts[parts.length - 1] ?? "", path };
  }
}

function mapDriveFile(f: Record<string, unknown>): StorageFile {
  return {
    id: f.id as string,
    name: f.name as string,
    mimeType: f.mimeType as string,
    size: parseInt(String(f.size ?? "0")),
    createdAt: f.createdTime as string,
    modifiedAt: f.modifiedTime as string,
    webUrl: f.webViewLink as string | undefined,
  };
}
