export type LanguageCode = "en" | "gr" | "pl" | "is" | "cn" | "fr" | "es" | "de" | "he" | "sv" | "sr";

export interface Env {
  SECRETS: KVNamespace;
  ENCRYPTION_KEY: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export interface SecretRecord {
  id: string;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAt: string;
  expiresAt: string;
  maxRetrievals: number;
  retrievals: number;
  language: LanguageCode;
  deleteTokenHash: string;
  version: 1;
}

export interface PublicSecretMeta {
  id: string;
  expiresAt: string;
  maxRetrievals: number;
  retrievals: number;
  remainingRetrievals: number;
  language: LanguageCode;
}

export interface CreateSecretRequest {
  secret?: unknown;
  days?: unknown;
  retrievals?: unknown;
  language?: unknown;
  turnstileToken?: unknown;
}
