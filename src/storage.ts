import { decryptText, encryptText, randomToken, sha256 } from "./crypto.js";
import { normalizeLanguage } from "./i18n.js";
import type { CreateSecretRequest, Env, LanguageCode, PublicSecretMeta, SecretRecord } from "./types.js";

export const DEFAULT_DAYS = 6;
export const MAX_DAYS = 10;
export const DEFAULT_RETRIEVALS = 10;
export const MAX_RETRIEVALS = 99;
export const MAX_SECRET_CHARS = 2000;

const DAY_SECONDS = 24 * 60 * 60;

export class ValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function keyFor(id: string): string {
  return `secret:${id}`;
}

function assertEncryptionKey(env: Env): string {
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 16) {
    throw new ValidationError("Server encryption key is not configured.", 500);
  }
  return env.ENCRYPTION_KEY;
}

export function parsePositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

export function validateSecretInput(input: CreateSecretRequest): {
  secret: string;
  days: number;
  retrievals: number;
  language: LanguageCode;
} {
  if (typeof input.secret !== "string" || input.secret.trim().length === 0) {
    throw new ValidationError("Secret text is required.");
  }
  if (input.secret.length > MAX_SECRET_CHARS) {
    throw new ValidationError(`Secret text must be ${MAX_SECRET_CHARS} characters or fewer.`);
  }
  return {
    secret: input.secret,
    days: parsePositiveInteger(input.days, DEFAULT_DAYS, MAX_DAYS),
    retrievals: parsePositiveInteger(input.retrievals, DEFAULT_RETRIEVALS, MAX_RETRIEVALS),
    language: normalizeLanguage(typeof input.language === "string" ? input.language : undefined)
  };
}

export function isExpired(record: SecretRecord, now = new Date()): boolean {
  return Date.parse(record.expiresAt) <= now.getTime();
}

export function toPublicMeta(record: SecretRecord): PublicSecretMeta {
  const remainingRetrievals = Math.max(record.maxRetrievals - record.retrievals, 0);
  return {
    id: record.id,
    expiresAt: record.expiresAt,
    maxRetrievals: record.maxRetrievals,
    retrievals: record.retrievals,
    remainingRetrievals,
    language: record.language
  };
}

export async function createSecret(env: Env, input: CreateSecretRequest): Promise<{ id: string; deleteToken: string; meta: PublicSecretMeta }> {
  const encryptionSecret = assertEncryptionKey(env);
  const validated = validateSecretInput(input);
  const id = randomToken(18);
  const deleteToken = randomToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + validated.days * DAY_SECONDS * 1000);
  const encrypted = await encryptText(validated.secret, encryptionSecret);
  const record: SecretRecord = {
    id,
    ...encrypted,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maxRetrievals: validated.retrievals,
    retrievals: 0,
    language: validated.language,
    deleteTokenHash: await sha256(deleteToken),
    version: 1
  };
  await env.SECRETS.put(keyFor(id), JSON.stringify(record), { expirationTtl: validated.days * DAY_SECONDS });
  return { id, deleteToken, meta: toPublicMeta(record) };
}

export async function getSecretMeta(env: Env, id: string): Promise<PublicSecretMeta | null> {
  const record = await getRecord(env, id);
  if (!record || isExpired(record) || record.retrievals >= record.maxRetrievals) return null;
  return toPublicMeta(record);
}

async function getRecord(env: Env, id: string): Promise<SecretRecord | null> {
  const raw = await env.SECRETS.get(keyFor(id));
  if (!raw) return null;
  return JSON.parse(raw) as SecretRecord;
}

export async function revealSecret(env: Env, id: string): Promise<{ secret: string; meta: PublicSecretMeta } | null> {
  const encryptionSecret = assertEncryptionKey(env);
  const record = await getRecord(env, id);
  if (!record || isExpired(record) || record.retrievals >= record.maxRetrievals) {
    if (record && (isExpired(record) || record.retrievals >= record.maxRetrievals)) await env.SECRETS.delete(keyFor(id));
    return null;
  }
  const secret = await decryptText(record.ciphertext, record.iv, record.salt, encryptionSecret);
  record.retrievals += 1;
  if (record.retrievals >= record.maxRetrievals) {
    await env.SECRETS.delete(keyFor(id));
  } else {
    const ttl = Math.max(Math.ceil((Date.parse(record.expiresAt) - Date.now()) / 1000), 1);
    await env.SECRETS.put(keyFor(id), JSON.stringify(record), { expirationTtl: ttl });
  }
  return { secret, meta: toPublicMeta(record) };
}

export async function deleteSecret(env: Env, token: string): Promise<boolean> {
  const [id, deleteToken] = token.split(".");
  if (!id || !deleteToken) return false;
  const record = await getRecord(env, id);
  if (!record) return false;
  if ((await sha256(deleteToken)) !== record.deleteTokenHash) return false;
  await env.SECRETS.delete(keyFor(id));
  return true;
}
