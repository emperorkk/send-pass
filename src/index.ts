import { createPage, deletedPage, revealPage } from "./html.js";
import { normalizeLanguage } from "./i18n.js";
import { assertRequiredConfiguration, createSecret, deleteSecret, getSecretMeta, revealSecret, ValidationError } from "./storage.js";
import type { CreateSecretRequest, Env, LanguageCode } from "./types.js";

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'unsafe-inline'; frame-src https://challenges.cloudflare.com; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
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

function text(body: string, contentType: string, status = 200): Response {
  return withHeaders(new Response(body, { status, headers: { "content-type": contentType } }));
}

function errorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function internalError(error: unknown): Response {
  console.error("Secret Drop Worker error", error);
  return json({ error: "Server error while processing the request.", details: errorDetails(error) }, 500);
}

function getLanguage(url: URL): LanguageCode {
  return normalizeLanguage(url.searchParams.get("lang"));
}

export function resolveRevealLanguage(url: URL, storedLanguage?: LanguageCode): LanguageCode {
  return url.searchParams.has("lang") ? getLanguage(url) : storedLanguage ?? getLanguage(url);
}

function publicUrl(request: Request, path: string): string {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  return url.toString();
}

function robotsTxt(request: Request): Response {
  return text(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${publicUrl(request, "/sitemap.xml")}\n`, "text/plain; charset=utf-8");
}

function sitemapXml(request: Request): Response {
  const updated = new Date().toISOString();
  return text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${publicUrl(request, "/")}</loc>\n    <lastmod>${updated}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`, "application/xml; charset=utf-8");
}

function siteManifest(): Response {
  return json({ name: "Secret Drop", short_name: "Secret Drop", description: "Secure self-destructing password links", start_url: "/", display: "standalone", background_color: "#0b1020", theme_color: "#7c5cff", categories: ["security", "productivity", "utilities"] });
}

function socialCard(): Response {
  return text(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Secret Drop secure self-destructing password links"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b1020"/><stop offset="0.55" stop-color="#17223d"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="1040" cy="80" r="210" fill="#26d0ce" opacity="0.28"/><circle cx="120" cy="520" r="260" fill="#7c5cff" opacity="0.26"/><text x="90" y="210" fill="#f5f7fb" font-family="Inter,Arial,sans-serif" font-size="86" font-weight="800">Secret Drop</text><text x="90" y="305" fill="#dfe6ff" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="700">Secure self-destructing password links</text><text x="90" y="380" fill="#a9b4cc" font-family="Inter,Arial,sans-serif" font-size="30">Encrypted sharing • Expiring links • Retrieval limits</text><rect x="90" y="450" width="360" height="74" rx="24" fill="#ffffff" opacity="0.12"/><text x="125" y="498" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700">No account required</text></svg>`, "image/svg+xml; charset=utf-8");
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

  if (request.method === "GET" && url.pathname === "/health") {
    try {
      assertRequiredConfiguration(env);
      return json({ ok: true, configuration: { secretsBinding: true, encryptionKey: true, turnstile: Boolean(env.TURNSTILE_SECRET_KEY) } });
    } catch (error) {
      if (error instanceof ValidationError) return json({ ok: false, error: error.message }, error.status);
      return internalError(error);
    }
  }
  if (request.method === "GET" && url.pathname === "/robots.txt") return robotsTxt(request);
  if (request.method === "GET" && url.pathname === "/sitemap.xml") return sitemapXml(request);
  if (request.method === "GET" && url.pathname === "/site.webmanifest") return siteManifest();
  if (request.method === "GET" && url.pathname === "/social-card.svg") return socialCard();
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
      return internalError(error);
    }
  }
};
