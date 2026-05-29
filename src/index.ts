import { createPage, deletedPage, revealPage } from "./html.js";
import { normalizeLanguage } from "./i18n.js";
import { createSecret, deleteSecret, getSecretMeta, revealSecret, ValidationError } from "./storage.js";
import type { CreateSecretRequest, Env, LanguageCode } from "./types.js";

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'unsafe-inline'; frame-src https://challenges.cloudflare.com; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-robots-tag": "noindex, nofollow"
};

function withHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function html(body: string, status = 200): Response {
  return withHeaders(new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } }));
}

function json(body: unknown, status = 200): Response {
  return withHeaders(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } }));
}

function getLanguage(url: URL): LanguageCode {
  return normalizeLanguage(url.searchParams.get("lang"));
}

export function resolveRevealLanguage(url: URL, storedLanguage?: LanguageCode): LanguageCode {
  return url.searchParams.has("lang") ? getLanguage(url) : storedLanguage ?? getLanguage(url);
}

function buildUrl(request: Request, path: string, language: LanguageCode): string {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = new URLSearchParams({ lang: language }).toString();
  return url.toString();
}

async function verifyTurnstile(env: Env, token: unknown, request: Request): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (typeof token !== "string" || !token) return false;
  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) formData.append("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: formData });
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const payload = (await request.json()) as CreateSecretRequest;
  if (!(await verifyTurnstile(env, payload.turnstileToken, request))) {
    return json({ error: "Turnstile verification failed." }, 403);
  }
  const created = await createSecret(env, payload);
  const deleteToken = `${created.id}.${created.deleteToken}`;
  return json({
    id: created.id,
    meta: created.meta,
    shareUrl: buildUrl(request, `/s/${created.id}`, created.meta.language),
    deleteUrl: buildUrl(request, `/delete/${deleteToken}`, created.meta.language)
  }, 201);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const language = getLanguage(url);

  if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
  if (request.method === "GET" && url.pathname === "/") return html(createPage(language, env.TURNSTILE_SITE_KEY));
  if (request.method === "POST" && url.pathname === "/api/secrets") return handleCreate(request, env);

  const secretMatch = url.pathname.match(/^\/s\/([^/]+)$/);
  if (request.method === "GET" && secretMatch) {
    const meta = await getSecretMeta(env, secretMatch[1]);
    return html(revealPage(resolveRevealLanguage(url, meta?.language), meta), meta ? 200 : 404);
  }

  const revealMatch = url.pathname.match(/^\/api\/secrets\/([^/]+)\/reveal$/);
  if (request.method === "POST" && revealMatch) {
    const revealed = await revealSecret(env, revealMatch[1]);
    if (!revealed) return json({ error: "Secret unavailable." }, 404);
    return json(revealed);
  }

  const deleteMatch = url.pathname.match(/^\/delete\/([^/]+)$/);
  if (request.method === "GET" && deleteMatch) {
    const deleted = await deleteSecret(env, deleteMatch[1]);
    return html(deletedPage(language, deleted), deleted ? 200 : 404);
  }

  return html(revealPage(language, null), 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof ValidationError) return json({ error: error.message }, error.status);
      return json({ error: "Internal server error." }, 500);
    }
  }
};
