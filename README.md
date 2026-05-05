# My Health School — Invoice Dashboard

A small Next.js app that lets staff look up a customer by 10-digit mobile number across every payment source in the FY26-27 income recognition Google Sheet, restricted to rows classified `002 (L2 Application)`, `003 (L2 Diamond)`, `004 (L2 Gold)`, or `005 (L2 EMI)`.

Each payment source (Razorpay, Pine Labs, Savein, Bajaj, Paytm, PhonePe, Jodo, Easebuzz, Tagmamgo) renders as its own card in the result.

## How it works

The Next.js app calls a small **Apps Script web app** that lives inside the Google Sheet itself. Apps Script runs as the sheet owner, so no Google Cloud project, no service account, and no organisation policies are involved. The web app is protected by a shared bearer token that only the dashboard server knows.

## One-time setup

### 1. Install the Apps Script bridge

1. Open the spreadsheet at https://docs.google.com/spreadsheets/d/1HVfUcWKmMo_mgqUObvJLpGri4aHeu-8rHz1DQJOzeiw/edit
2. **Extensions → Apps Script**.
3. Replace the contents of the editor with the file at `apps-script/Code.gs` in this repo (copy/paste the whole file).
4. Click the **gear icon (Project Settings)** in the left sidebar → scroll to **Script properties** → **Add script property**:
   - **Property:** `API_TOKEN`
   - **Value:** any long random string (this becomes `APPS_SCRIPT_TOKEN` below)
   - Click **Save script properties**
5. Back to the editor → **Deploy → New deployment**.
6. Click the gear next to "Select type" → **Web app**.
7. Set:
   - **Description:** `MHS Dashboard bridge`
   - **Execute as:** Me
   - **Who has access:** Anyone (with the link)
8. Click **Deploy** → authorise when prompted (sign in with your Google account, click "Advanced" → "Go to … (unsafe)" if prompted).
9. Copy the **Web app URL** (ends in `/exec`). This becomes `APPS_SCRIPT_URL`.

### 2. Configure env vars

Copy `.env.example` to `.env.local` and fill it in:

```
DASHBOARD_PASSWORD=<pick a shared password>
SESSION_SECRET=<32+ random chars>
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
APPS_SCRIPT_TOKEN=<same value as the API_TOKEN script property>
```

### 3. Install + run

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign in with `DASHBOARD_PASSWORD`, type a 10-digit number.

### 4. Verify the sheet config (optional)

If a sheet is missing from results, run:

```bash
npm run inspect-headers
```

It hits the Apps Script bridge and prints every tab + headers, so you can confirm the phone column names. Adjust `lib/sheets-config.ts` if a tab uses an unexpected header.

## Deploying to Vercel

1. `npm install -g vercel` (once).
2. `vercel link` in this folder.
3. `vercel env add` for each variable in `.env.example` (Production + Preview).
4. `vercel --prod` to deploy.

## Notes

- Read-only — the dashboard never writes back.
- Sheet data is cached server-side for 5 minutes per tab.
- ICICI is intentionally skipped — it's a bank statement with no per-customer phone column.
- Rows whose classification isn't `002`, `003`, `004`, or `005` are filtered out of search results.

## Updating the bridge later

If you change `apps-script/Code.gs`:
1. Paste the new code into Apps Script.
2. **Deploy → Manage deployments** → click the pencil on the existing deployment → set **Version: New version** → **Deploy**.

If you create a *new* deployment instead, the URL changes, and you must update `APPS_SCRIPT_URL` in `.env.local` and Vercel.
