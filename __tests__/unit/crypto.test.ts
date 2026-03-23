import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptJson, decryptJson } from "@/lib/crypto";

describe("Crypto (AES-256-GCM)", () => {
  it("encrypt → decrypt devuelve el texto original", () => {
    const original = "sk-ant-api03-secret-key-here";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("strings encriptados empiezan con 'enc:'", () => {
    const encrypted = encrypt("test");
    expect(encrypted.startsWith("enc:")).toBe(true);
  });

  it("encryptJson → decryptJson devuelve el objeto original", () => {
    const data = { accessToken: "abc123", refreshToken: "xyz789", expiresAt: 1234567890 };
    const encrypted = encryptJson(data);
    const decrypted = decryptJson(encrypted);
    expect(decrypted).toEqual(data);
  });

  it("decrypt de texto plano (backward compat) devuelve el string", () => {
    const plain = "plain-text-not-encrypted";
    const result = decrypt(plain);
    expect(result).toBe(plain);
  });
});
