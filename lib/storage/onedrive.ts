/**
 * Microsoft OneDrive storage provider.
 *
 * Implements StorageProvider using Microsoft Graph API.
 * Requires OAuth2 credentials (access_token).
 */

import type { StorageProvider, StorageFile, StorageFolder, UploadOptions } from "./types";

const GRAPH_URL = "https://graph.microsoft.com/v1.0";

export class OneDriveProvider implements StorageProvider {
  readonly name = "onedrive" as const;

  constructor(private accessToken: string) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  async listFiles(folderId: string): Promise<StorageFile[]> {
    const path = folderId === "root"
      ? `${GRAPH_URL}/me/drive/root/children`
      : `${GRAPH_URL}/me/drive/items/${folderId}/children`;

    const res = await fetch(`${path}?$select=id,name,file,size,createdDateTime,lastModifiedDateTime,webUrl`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`OneDrive listFiles failed: ${res.status}`);
    const data = await res.json();
    return (data.value ?? [])
      .filter((item: Record<string, unknown>) => item.file)
      .map(mapGraphFile);
  }

  async uploadFile(options: UploadOptions): Promise<StorageFile> {
    const path = `${GRAPH_URL}/me/drive/items/${options.folderId}:/${encodeURIComponent(options.fileName)}:/content`;
    const res = await fetch(path, {
      method: "PUT",
      headers: {
        ...this.headers(),
        "Content-Type": options.mimeType,
      },
      body: options.content as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`OneDrive upload failed: ${res.status}`);
    return mapGraphFile(await res.json());
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const res = await fetch(`${GRAPH_URL}/me/drive/items/${fileId}/content`, {
      headers: this.headers(),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`OneDrive download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(`${GRAPH_URL}/me/drive/items/${fileId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`OneDrive delete failed: ${res.status}`);
    }
  }

  async createFolder(parentId: string, name: string): Promise<StorageFolder> {
    const path = parentId === "root"
      ? `${GRAPH_URL}/me/drive/root/children`
      : `${GRAPH_URL}/me/drive/items/${parentId}/children`;

    const res = await fetch(path, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    if (res.status === 409) {
      // Folder already exists, find it
      const listRes = await fetch(
        `${parentId === "root" ? `${GRAPH_URL}/me/drive/root` : `${GRAPH_URL}/me/drive/items/${parentId}`}/children?$filter=name eq '${name}'`,
        { headers: this.headers() }
      );
      const listData = await listRes.json();
      const existing = listData.value?.[0];
      if (existing) {
        return { id: existing.id, name: existing.name, path: name, webUrl: existing.webUrl };
      }
    }

    if (!res.ok) throw new Error(`OneDrive createFolder failed: ${res.status}`);
    const data = await res.json();
    return { id: data.id, name: data.name, path: name, webUrl: data.webUrl };
  }

  async ensureFolder(path: string): Promise<StorageFolder> {
    const parts = path.split("/").filter(Boolean);
    let parentId = "root";

    for (const part of parts) {
      try {
        const folder = await this.createFolder(parentId, part);
        parentId = folder.id;
      } catch {
        // If creation fails (conflict), list and find
        const listPath = parentId === "root"
          ? `${GRAPH_URL}/me/drive/root/children`
          : `${GRAPH_URL}/me/drive/items/${parentId}/children`;
        const res = await fetch(`${listPath}?$filter=name eq '${part}'`, {
          headers: this.headers(),
        });
        const data = await res.json();
        if (data.value?.[0]) {
          parentId = data.value[0].id;
        } else {
          throw new Error(`Failed to ensure folder: ${path}`);
        }
      }
    }

    return { id: parentId, name: parts[parts.length - 1] ?? "", path };
  }
}

function mapGraphFile(f: Record<string, unknown>): StorageFile {
  const file = f.file as Record<string, unknown> | undefined;
  return {
    id: f.id as string,
    name: f.name as string,
    mimeType: (file?.mimeType as string) ?? "application/octet-stream",
    size: (f.size as number) ?? 0,
    createdAt: f.createdDateTime as string,
    modifiedAt: f.lastModifiedDateTime as string,
    webUrl: f.webUrl as string | undefined,
  };
}
