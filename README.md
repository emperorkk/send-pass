# Secret Drop

Secret Drop is a polished Cloudflare Worker web app for sharing sensitive text with self-destructing links. It stores pasted text under a high-entropy key, encrypts the secret before writing to Cloudflare KV, and provides a language-aware delivery link that can expire by time and retrieval count.

## Features

- Paste-only secret text with a 2000 character limit.
- Cloudflare KV-backed storage with automatic TTL expiry.
- Server-side AES-GCM encryption using a Worker secret named `ENCRYPTION_KEY`.
- Default lifetime of 6 days, configurable up to 10 days.
- Default retrieval limit of 10, configurable up to 99 retrievals.
- Reveal button so previews and accidental page loads do not consume a retrieval.
- Sender delete/revoke link.
- Localized interface for English, Greek, Polish, Icelandic, Chinese, French, and Spanish.
- Generated delivery links preserve the selected language with `?lang=`.
- Optional Cloudflare Turnstile verification when `TURNSTILE_SECRET_KEY` is configured.
- Security headers and noindex responses.

## Cloudflare setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create KV namespaces:

   ```bash
   npx wrangler kv namespace create SECRETS
   npx wrangler kv namespace create SECRETS --preview
   ```

3. Replace the placeholder namespace IDs in `wrangler.toml` with the IDs returned by Wrangler.

4. Set the encryption secret. Use a long random value:

   ```bash
   npx wrangler secret put ENCRYPTION_KEY
   ```

5. Optional Turnstile setup:

   - Set `TURNSTILE_SITE_KEY` in `wrangler.toml`.
   - Add the matching secret:

     ```bash
     npx wrangler secret put TURNSTILE_SECRET_KEY
     ```

6. Run locally:

   ```bash
   npm run dev
   ```

7. Deploy:

   ```bash
   npm run deploy
   ```

## Cloudflare auto-deploy

The committed `wrangler.toml` points Cloudflare to `src/index.ts` as the Worker entrypoint. After replacing the KV IDs and setting required secrets in Cloudflare, connect this repository in Cloudflare Workers & Pages or deploy with Wrangler from CI.

## Limits

- Secret text: 2000 characters.
- Availability: 1-10 days, default 6.
- Retrievals: 1-99, default 10.

## Important security note

Cloudflare KV is eventually consistent, so simultaneous reveal requests can race in rare cases. For strict atomic retrieval counting under heavy concurrency, migrate the retrieval counter to Durable Objects or D1 transactions.
