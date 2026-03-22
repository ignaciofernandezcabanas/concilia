/**
 * Storage abstraction types.
 *
 * Unified interface for Google Drive and Microsoft OneDrive.
 * Each provider implements StorageProvider.
 */

export interface StorageFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  webUrl?: string;
  downloadUrl?: string;
}

export interface StorageFolder {
  id: string;
  name: string;
  path: string;
  webUrl?: string;
}

export interface UploadOptions {
  folderId: string;
  fileName: string;
  mimeType: string;
  content: Buffer | Uint8Array;
}

export interface StorageProvider {
  readonly name: "google_drive" | "onedrive";

  /** List files in a folder */
  listFiles(folderId: string): Promise<StorageFile[]>;

  /** Upload a file to a folder */
  uploadFile(options: UploadOptions): Promise<StorageFile>;

  /** Download file content */
  downloadFile(fileId: string): Promise<Buffer>;

  /** Delete a file */
  deleteFile(fileId: string): Promise<void>;

  /** Create a folder */
  createFolder(parentId: string, name: string): Promise<StorageFolder>;

  /** Get or create a folder by path (e.g., "Concilia/2026/Q1") */
  ensureFolder(path: string): Promise<StorageFolder>;
}

/**
 * Email abstraction types.
 *
 * Unified interface for Gmail and Microsoft Outlook (read-only).
 */

export interface EmailMessage {
  id: string;
  threadId?: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
  labels?: string[];
}

export interface EmailAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface EmailProvider {
  readonly name: "gmail" | "outlook";

  /** Search for emails matching a query */
  searchMessages(query: string, maxResults?: number): Promise<EmailMessage[]>;

  /** Get a specific message with attachments metadata */
  getMessage(messageId: string): Promise<EmailMessage>;

  /** Download an attachment */
  downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer>;
}
