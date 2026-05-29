import { DEFAULT_DAYS, DEFAULT_RETRIEVALS, MAX_DAYS, MAX_RETRIEVALS, MAX_SECRET_CHARS } from "./storage.js";
import { LANGUAGES, t } from "./i18n.js";
import type { LanguageCode, PublicSecretMeta } from "./types.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));
}

function langOptions(selected: LanguageCode): string {
  return LANGUAGES.map((language) => `<option value="${language.code}" ${language.code === selected ? "selected" : ""}>${escapeHtml(language.nativeName)}</option>`).join("");
}

function shell(language: LanguageCode, body: string, options: { turnstileSiteKey?: string; meta?: PublicSecretMeta | null; page?: string } = {}): string {
  const strings = t(language);
  const state = JSON.stringify({ language, strings, maxChars: MAX_SECRET_CHARS, turnstileSiteKey: options.turnstileSiteKey || "", meta: options.meta ?? null, page: options.page ?? "create" }).replace(/</g, "\\u003c");
  const direction = language === "he" ? "rtl" : "ltr";
  return `<!doctype html>
<html lang="${language}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(strings.appName)}</title>
  <meta name="robots" content="noindex,nofollow">
  <style>${styles()}</style>
  ${options.turnstileSiteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ""}
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand"><span class="logo">✦</span><span>${escapeHtml(strings.appName)}</span></div>
      <label class="language"><span>${escapeHtml(strings.language)}</span><select id="languageSelect">${langOptions(language)}</select></label>
      <h1>${escapeHtml(strings.tagline)}</h1>
    </section>
    ${body}
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script>window.SECRET_DROP=${state};</script>
  <script>${clientScript()}</script>
</body>
</html>`;
}

export function createPage(language: LanguageCode, turnstileSiteKey?: string): string {
  const strings = t(language);
  return shell(language, `<section class="card">
    <h2>${escapeHtml(strings.createTitle)}</h2>
    <p class="muted">${escapeHtml(strings.createDescription)}</p>
    <form id="createForm" class="form">
      <label>${escapeHtml(strings.secretLabel)}<textarea id="secret" name="secret" maxlength="${MAX_SECRET_CHARS}" placeholder="${escapeHtml(strings.secretPlaceholder)}" required></textarea></label>
      <div class="charline"><span id="charCount">0</span> / ${MAX_SECRET_CHARS} ${escapeHtml(strings.charCount)}</div>
      <div class="grid two">
        <label>${escapeHtml(strings.daysLabel)}<input name="days" type="number" min="1" max="${MAX_DAYS}" value="${DEFAULT_DAYS}" required></label>
        <label>${escapeHtml(strings.retrievalsLabel)}<input name="retrievals" type="number" min="1" max="${MAX_RETRIEVALS}" value="${DEFAULT_RETRIEVALS}" required></label>
      </div>
      ${turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}"></div>` : ""}
      <button class="primary" type="submit">${escapeHtml(strings.createButton)}</button>
    </form>
    <p class="privacy">${escapeHtml(strings.privacyNote)}</p>
  </section>
  <section id="result" class="card result hidden"></section>`, { turnstileSiteKey, page: "create" });
}

export function revealPage(language: LanguageCode, meta: PublicSecretMeta | null): string {
  const strings = t(language);
  const content = meta ? `<section class="card">
    <h2>${escapeHtml(strings.revealTitle)}</h2>
    <p class="muted">${escapeHtml(strings.revealDescription)}</p>
    <div class="stats"><span>${meta.remainingRetrievals} ${escapeHtml(strings.remaining)}</span><span>${escapeHtml(strings.expires)} ${escapeHtml(new Date(meta.expiresAt).toLocaleString(language))}</span></div>
    <button id="revealButton" class="primary" type="button">${escapeHtml(strings.revealButton)}</button>
    <pre id="secretOutput" class="secret-output hidden"></pre>
  </section>` : unavailable(language);
  return shell(language, content, { meta, page: "reveal" });
}

export function deletedPage(language: LanguageCode, deleted: boolean): string {
  const strings = t(language);
  return shell(language, `<section class="card"><h2>${escapeHtml(deleted ? strings.deletedTitle : strings.secretUnavailable)}</h2><p class="muted">${escapeHtml(deleted ? strings.deletedDescription : strings.secretUnavailableDescription)}</p><a class="secondary" href="/?lang=${language}">${escapeHtml(strings.createAnother)}</a></section>`, { page: "deleted" });
}

function unavailable(language: LanguageCode): string {
  const strings = t(language);
  return `<section class="card"><h2>${escapeHtml(strings.secretUnavailable)}</h2><p class="muted">${escapeHtml(strings.secretUnavailableDescription)}</p><a class="secondary" href="/?lang=${language}">${escapeHtml(strings.createAnother)}</a></section>`;
}

function styles(): string {
  return `:root{color-scheme:dark;--bg:#0b1020;--card:#121a30;--card2:#17223d;--text:#f5f7fb;--muted:#a9b4cc;--accent:#7c5cff;--accent2:#26d0ce;--danger:#ff6b6b;--ring:rgba(124,92,255,.35)}*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 10% 10%,rgba(124,92,255,.35),transparent 30%),radial-gradient(circle at 90% 0,rgba(38,208,206,.22),transparent 28%),var(--bg);color:var(--text)}.page{width:min(980px,92vw);margin:0 auto;padding:48px 0}.hero{display:grid;gap:18px;margin-bottom:28px}.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#dfe6ff}.logo{display:grid;place-items:center;width:38px;height:38px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 14px 40px rgba(124,92,255,.35)}h1{font-size:clamp(2.1rem,6vw,4.8rem);line-height:1;margin:0;max-width:850px}h2{font-size:clamp(1.45rem,3vw,2rem);margin:0 0 10px}.language{justify-self:end;display:flex;gap:10px;align-items:center;color:var(--muted)}select,input,textarea{width:100%;border:1px solid rgba(255,255,255,.13);border-radius:16px;background:#0f1629;color:var(--text);padding:13px 14px;font:inherit;outline:none}select:focus,input:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 4px var(--ring)}textarea{min-height:190px;resize:vertical;line-height:1.5}.card{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035));border:1px solid rgba(255,255,255,.12);border-radius:28px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.28);backdrop-filter:blur(16px)}.form{display:grid;gap:18px;margin-top:24px}label{display:grid;gap:8px;font-weight:700}.muted,.privacy,.charline{color:var(--muted)}.privacy{font-size:.95rem}.grid.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.primary,.secondary{border:0;border-radius:16px;padding:14px 18px;font-weight:800;font:inherit;cursor:pointer;text-decoration:none;text-align:center}.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;box-shadow:0 14px 35px rgba(124,92,255,.28)}.secondary{display:inline-block;background:rgba(255,255,255,.09);color:var(--text);border:1px solid rgba(255,255,255,.12)}.primary:disabled{opacity:.6;cursor:wait}.result{margin-top:22px}.hidden{display:none!important}.linkbox{display:grid;grid-template-columns:1fr auto;gap:10px;margin:12px 0 18px}.linkbox input{font-size:.92rem}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.stats span{padding:10px 12px;border-radius:999px;background:rgba(255,255,255,.08);color:#d9e2fb}.secret-output{white-space:pre-wrap;word-break:break-word;background:#090d19;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;margin-top:20px;color:#f7fbff}.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:12px 16px;border-radius:999px;background:#eef3ff;color:#111827;font-weight:800;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:.2s}.toast.show{opacity:1}@media(max-width:680px){.page{padding:28px 0}.language{justify-self:stretch}.grid.two,.linkbox{grid-template-columns:1fr}.card{padding:22px}h1{font-size:2.45rem}}`;
}

function clientScript(): string {
  return `(() => {
const state = window.SECRET_DROP;
const $ = (selector) => document.querySelector(selector);
const toast = (message) => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1700); };
const withLang = (url) => { const next = new URL(url, location.origin); next.searchParams.set('lang', $('#languageSelect').value); return next.toString(); };
$('#languageSelect')?.addEventListener('change', (event) => { const url = new URL(location.href); url.searchParams.set('lang', event.target.value); location.href = url.toString(); });
const secret = $('#secret');
secret?.addEventListener('input', () => { $('#charCount').textContent = String(secret.value.length); });
async function copy(value){ await navigator.clipboard.writeText(value); toast(state.strings.copied); }
window.copySecretDrop = copy;
$('#createForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const turnstileToken = window.turnstile ? window.turnstile.getResponse() : '';
    const response = await fetch('/api/secrets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: form.secret.value, days: form.days.value, retrievals: form.retrievals.value, language: $('#languageSelect').value, turnstileToken }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || state.strings.errorGeneric);
    const result = $('#result');
    result.innerHTML = '<h2>'+state.strings.linkReady+'</h2>'+linkRow(state.strings.shareLink, data.shareUrl)+linkRow(state.strings.deleteLink, data.deleteUrl)+'<a class="secondary" href="/?lang='+state.language+'">'+state.strings.createAnother+'</a>';
    result.classList.remove('hidden');
    form.reset(); $('#charCount').textContent = '0';
    if (window.turnstile) window.turnstile.reset();
  } catch (error) { toast(error.message || state.strings.errorGeneric); }
  finally { button.disabled = false; }
});
function linkRow(label, value){ return '<label>'+label+'<div class="linkbox"><input readonly value="'+escapeAttr(value)+'"><button class="secondary" type="button" onclick="copySecretDrop(\''+escapeJs(value)+'\')">'+state.strings.copy+'</button></div></label>'; }
function escapeAttr(value){ return value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'); }
function escapeJs(value){ return value.replaceAll('\\','\\\\').replaceAll("'","\\'"); }
$('#revealButton')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const id = location.pathname.split('/').pop();
    const response = await fetch('/api/secrets/'+encodeURIComponent(id)+'/reveal', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || state.strings.errorGeneric);
    $('#secretOutput').textContent = data.secret;
    $('#secretOutput').classList.remove('hidden');
    button.textContent = state.strings.revealedTitle;
  } catch (error) { toast(error.message || state.strings.errorGeneric); button.disabled = false; }
});
})();`;
}
