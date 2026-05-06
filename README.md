# My Health School — Invoice Dashboard

A small Next.js app that lets staff look up a customer by 10-digit mobile number across every payment source in the FY26-27 income recognition Google Sheet, restricted to rows classified `002 (L2 Application)`, `003 (L2 Diamond)`, `004 (L2 Gold)`, or `005 (L2 EMI)`.

Each payment source (ICICI, Razorpay, Tagmamgo, Savein, Bajaj, PhonePe, Jodo) renders as its own card in the result.

## Architecture

The Next.js app calls the Google Sheets API v4 directly using OAuth user credentials (client ID + client secret + long-lived refresh token). Behind the scenes:

1. The refresh token is exchanged for an access token (cached for ~50 minutes).
2. A single `values:batchGet` call fetches every in-scope tab in ~1.5 s.
3. We build a **phone index** (rows where a phone column has a value AND the row is classified 002-005) and cache it for 10 minutes.
4. Lookups filter the cached index in memory — sub-millisecond.

Cold path: ~2 s. Warm path: ~100 ms. No service account, no Apps Script.

## One-time setup

### 1. Get Google OAuth credentials

You need three values: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`.

1. **Create an OAuth client** in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):
   - Click **Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorised redirect URIs: add `https://developers.google.com/oauthplayground`.
   - Click **Create**. Copy the **Client ID** and **Client secret**.
2. **Mint a refresh token** via the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):
   - Click the gear icon (top right) → tick **Use your own OAuth credentials** → paste the Client ID + Secret.
   - In the left panel, paste this scope into the input box and click **Authorize APIs**:
     `https://www.googleapis.com/auth/spreadsheets.readonly`
   - Sign in with the Google account that has access to the spreadsheet.
   - On step 2, click **Exchange authorization code for tokens**.
   - Copy the **Refresh token**.
3. **Enable the Sheets API** in your Google Cloud project: search "Google Sheets API" in the cloud console → click Enable.

### 2. Configure env vars

Copy `.env.example` to `.env.local` and fill in:

```
DASHBOARD_PASSWORD=<pick a shared password>
SESSION_SECRET=<32+ random chars>
GOOGLE_SHEETS_ID=1URoRKBYb8g_CRhoerD0ULX84pMRCRpnXT4dU6Z3Ubgo
GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REFRESH_TOKEN=1//...
```

### 3. Install + run

```bash
npm install
npm run dev
```

Open http://localhost:3000 (or whatever port), sign in with `DASHBOARD_PASSWORD`, type a 10-digit number.

### 4. Verify the sheet config (optional)

If a sheet is missing from results, run:

```bash
npm run inspect-headers
```

It hits the Sheets API and prints headers for every in-scope tab so you can confirm the phone column names. Adjust `lib/sheets-config.ts` if a tab uses an unexpected header.

## Deploying to Vercel

1. `npm install -g vercel` (once).
2. `vercel link` in this folder.
3. `vercel env add` for each variable in `.env.example` (Production + Preview).
4. `vercel --prod` to deploy.

For 24/7 instant lookups, set up a Vercel Cron that hits `/api/warmup` every 5 minutes — keeps the phone index hot.

## Notes

- Read-only — the dashboard never writes back to the sheet.
- The phone index is cached for 10 minutes. Edits to the sheet take up to 10 minutes to appear (or until the cache is busted).
- Rows whose classification isn't `002`, `003`, `004`, or `005` are filtered out of search results.
- Phones are matched on the last 10 digits, ignoring `+91`, leading zeros, and formatting.
- The `inspect-headers` script (`npm run inspect-headers`) lists every in-scope tab's headers, useful for diagnosing config drift.

## Switching to a different spreadsheet

Just update `GOOGLE_SHEETS_ID` in `.env.local` (or in Vercel env vars) and restart. The same OAuth credentials can read any sheet the original Google account has access to.

## Security

- The refresh token grants read access to **every Google Sheet the original Google account can see**, not just this one. Keep `.env.local` out of source control (`.gitignore` covers it).
- Rotate the refresh token periodically: revoke it in your [Google Account permissions](https://myaccount.google.com/permissions), then mint a new one.
- The dashboard is gated by a single shared password. For multi-user audit trails, switch to per-user Google sign-in.
