import { unstable_cache } from "next/cache";
import {
  SHEETS,
  ALLOWED_CLASSIFICATIONS,
  findClassificationInRow,
  findPhoneHeaders,
  isAllowedClassification,
} from "./sheets-config";
import { normalizePhone } from "./phone";

export type IndexEntry = {
  phone: string;
  classification: string;
  sheet: string;
  displayName: string;
  matchedHeader: string;
  data: Record<string, unknown>;
};

export type PhoneIndex = {
  index: IndexEntry[];
  errors: { sheetName: string; message: string }[];
  fetchedAt: number;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/* ------------------------------------------------------------------------- */
/* OAuth access-token refresh (cached ~50 min via unstable_cache)             */
/* ------------------------------------------------------------------------- */

type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

async function fetchAccessTokenUncached(): Promise<{ token: string; expiresAt: number }> {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: requireEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google OAuth token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

const getAccessToken = unstable_cache(
  async () => fetchAccessTokenUncached(),
  ["mhs-oauth-token-v1"],
  { revalidate: 3000, tags: ["oauth"] } // 50 minutes
);

/* ------------------------------------------------------------------------- */
/* Sheets API batchGet                                                         */
/* ------------------------------------------------------------------------- */

type BatchGetResponse = {
  spreadsheetId: string;
  valueRanges: Array<{ range: string; values?: unknown[][] }>;
};

async function batchGetSheets(): Promise<Map<string, unknown[][]>> {
  const sheetId = requireEnv("GOOGLE_SHEETS_ID");
  const { token } = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet`);
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  for (const s of SHEETS) url.searchParams.append("ranges", s.sheetName);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sheets API batchGet failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as BatchGetResponse;

  const byRange = new Map<string, unknown[][]>();
  for (const vr of data.valueRanges ?? []) {
    // range like "Razorpay!A1:AD3088" or "'Bajaj Sheet'!A1:..."
    const tabName = parseRangeTab(vr.range);
    byRange.set(tabName, vr.values ?? []);
  }
  return byRange;
}

function parseRangeTab(range: string): string {
  const idx = range.indexOf("!");
  const head = idx >= 0 ? range.slice(0, idx) : range;
  // strip surrounding single quotes
  return head.replace(/^'|'$/g, "");
}

/* ------------------------------------------------------------------------- */
/* Phone-index build                                                           */
/* ------------------------------------------------------------------------- */

async function buildPhoneIndexUncached(): Promise<PhoneIndex> {
  const errors: { sheetName: string; message: string }[] = [];
  let byTab: Map<string, unknown[][]>;
  try {
    byTab = await batchGetSheets();
  } catch (err) {
    return {
      index: [],
      errors: [
        { sheetName: "*", message: err instanceof Error ? err.message : String(err) },
      ],
      fetchedAt: Date.now(),
    };
  }

  const index: IndexEntry[] = [];
  for (const cfg of SHEETS) {
    const values = byTab.get(cfg.sheetName);
    if (!values || values.length === 0) {
      errors.push({ sheetName: cfg.sheetName, message: "no data" });
      continue;
    }
    const headers = (values[0] ?? []).map((h) => (h == null ? "" : String(h)));
    const phoneHeaders = findPhoneHeaders(headers, cfg.phoneColumnHints ?? []);
    if (phoneHeaders.length === 0) continue;
    const phoneIdxByHeader = new Map(phoneHeaders.map((h) => [h, headers.indexOf(h)]));

    for (let r = 1; r < values.length; r++) {
      const raw = values[r];
      if (!raw || raw.every((c) => c == null || c === "")) continue;
      // build row object
      const rowObj: Record<string, unknown> = {};
      for (let c = 0; c < headers.length; c++) {
        const h = headers[c] || `__col_${c}`;
        rowObj[h] = raw[c] ?? "";
      }
      // find phone hit
      let hitHeader: string | null = null;
      let hitPhone: string | null = null;
      for (const h of phoneHeaders) {
        const colIdx = phoneIdxByHeader.get(h)!;
        const candidate = normalizePhone(raw[colIdx]);
        if (candidate) {
          hitHeader = h;
          hitPhone = candidate;
          break;
        }
      }
      if (!hitPhone || !hitHeader) continue;
      const classification = findClassificationInRow(rowObj);
      if (!isAllowedClassification(classification)) continue;
      index.push({
        phone: hitPhone,
        classification: classification!,
        sheet: cfg.sheetName,
        displayName: cfg.displayName,
        matchedHeader: hitHeader,
        data: rowObj,
      });
    }
  }

  return { index, errors, fetchedAt: Date.now() };
}

/**
 * Cached phone index — small JSON of just the rows that have a phone
 * AND a 002-005 classification. First request after cold-start pays
 * ~1-2 s for the Sheets API batch call; everyone else is instant.
 */
export const getPhoneIndex = unstable_cache(
  async () => buildPhoneIndexUncached(),
  ["mhs-phone-index-v2"],
  { revalidate: 600, tags: ["phone-index"] }
);

export async function warmupBridge(): Promise<void> {
  await getPhoneIndex().catch(() => {});
}

/* ------------------------------------------------------------------------- */
/* Legacy fetchSheet/fetchTabs retained for inspect-headers script.            */
/* ------------------------------------------------------------------------- */

export async function fetchTabs(): Promise<string[]> {
  const sheetId = requireEnv("GOOGLE_SHEETS_ID");
  const { token } = await getAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Sheets API metadata failed: ${res.status}`);
  const data = (await res.json()) as { sheets?: Array<{ properties: { title: string } }> };
  return (data.sheets ?? []).map((s) => s.properties.title);
}

export async function fetchSheet(
  sheetName: string
): Promise<{ sheetName: string; headers: string[]; rows: Record<string, unknown>[] }> {
  const sheetId = requireEnv("GOOGLE_SHEETS_ID");
  const { token } = await getAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}`
  );
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets API fetch failed for "${sheetName}": ${res.status}`);
  const data = (await res.json()) as { values?: unknown[][] };
  const values = data.values ?? [];
  const headers = (values[0] ?? []).map((h) => (h == null ? "" : String(h)));
  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < values.length; r++) {
    const raw = values[r];
    if (!raw || raw.every((c) => c == null || c === "")) continue;
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c] || `__col_${c}`;
      row[h] = raw[c] ?? "";
    }
    rows.push(row);
  }
  return { sheetName, headers, rows };
}
