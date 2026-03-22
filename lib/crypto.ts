/**
 * AES-256-GCM encryption for secrets stored in DB.
 * Key derived from ENCRYPTION_KEY env var.
 *
 * Backward compatible: if data is a plain JSON object, reads directly.
 * If data is a string starting with "enc:", decrypts.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:";

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    // In development without ENCRYPTION_KEY, use a deterministic key (NOT secure for production)
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production");
    }
    return scryptSync("dev-key-not-for-production", "salt", 32);
  }
  return scryptSync(envKey, "concilia-salt", 32);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(packed: string): string {
  if (!packed.startsWith(PREFIX)) return packed;
  const key = getKey();
  const parts = packed.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted data format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encryptJson(data: unknown): string {
  return encrypt(JSON.stringify(data));
}

export function decryptJson<T = unknown>(packed: string): T {
  // Backward compatible: if it's a plain JSON object (not encrypted), parse directly
  if (!packed.startsWith(PREFIX)) {
    return JSON.parse(packed) as T;
  }
  return JSON.parse(decrypt(packed)) as T;
}
