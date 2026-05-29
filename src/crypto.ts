const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Cloudflare Workers currently reject PBKDF2 iteration counts above 100,000.
export const PBKDF2_ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomToken(bytes = 24): string {
  const buffer = new Uint8Array(new ArrayBuffer(bytes));
  crypto.getRandomValues(buffer);
  return toBase64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function deriveKey(secret: string, salt: Uint8Array<ArrayBuffer>, usages: KeyUsage[]): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(secret) as Uint8Array<ArrayBuffer>, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

export async function encryptText(plainText: string, secret: string): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const iv = new Uint8Array(new ArrayBuffer(12));
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(iv);
  crypto.getRandomValues(salt);
  const key = await deriveKey(secret, salt, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText) as Uint8Array<ArrayBuffer>);
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv), salt: toBase64(salt) };
}

export async function decryptText(ciphertext: string, iv: string, salt: string, secret: string): Promise<string> {
  const key = await deriveKey(secret, fromBase64(salt), ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext));
  return decoder.decode(decrypted);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value) as Uint8Array<ArrayBuffer>);
  return toBase64(new Uint8Array(digest));
}
