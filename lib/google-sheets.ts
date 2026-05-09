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

/* ------------------------------------------------------------------------- */
/* Destination "Accounts" sheet — append + duplicate scan                      */
/* ------------------------------------------------------------------------- */

const DEFAULT_ACCOUNTS_SHEETS_ID = "1cUFTVpZf-O-e-On2KwHqbl_Jpfwqqvmnf0_4H9xGJ50";

function accountsSheetId(): string {
  return process.env.ACCOUNTS_SHEETS_ID || DEFAULT_ACCOUNTS_SHEETS_ID;
}

/**
 * Returns a Map<phone, rowNumber> for column F of the given destination tab.
 * Cached briefly so duplicate scans during a flurry of clicks stay cheap.
 */
async function fetchDestPhonesUncached(tab: string): Promise<Array<[string, number]>> {
  const sheetId = accountsSheetId();
  const { token } = await getAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}!F:F`
  );
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`getDestPhones failed for "${tab}": ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  const out: Array<[string, number]> = [];
  const values = data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    const cell = values[i]?.[0];
    const phone = normalizePhone(cell);
    if (phone) out.push([phone, i + 1]); // 1-indexed row
  }
  return out;
}

export const getDestPhones = unstable_cache(
  async (tab: string) => fetchDestPhonesUncached(tab),
  ["mhs-dest-phones-v1"],
  { revalidate: 30, tags: ["dest-phones"] }
);

/**
 * Find the last row in the tab that has any non-empty cell in cols A-F.
 * Returns 0 if the entire tab is empty.
 */
async function lastNonEmptyRow(tab: string): Promise<number> {
  const sheetId = accountsSheetId();
  const { token } = await getAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}!A:F`
  );
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`lastNonEmptyRow failed for "${tab}": ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  const values = data.values ?? [];
  let last = 0;
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row && row.some((c) => c != null && String(c) !== "")) {
      last = i + 1; // 1-indexed
    }
  }
  return last;
}

/**
 * Write a single row at the next empty row after the last actually-non-empty
 * row. Avoids the values:append behaviour where Google's "data table"
 * detection adds extra blank rows of padding.
 */
export async function appendRows(tab: string, rows: (string | number)[][]): Promise<number[]> {
  if (rows.length === 0) return [];

  const sheetId = accountsSheetId();
  const { token } = await getAccessToken();

  const last = await lastNonEmptyRow(tab);
  const target = last + 1;

  const range = `${tab}!A${target}:AF${target + rows.length - 1}`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("includeValuesInResponse", "false");

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`appendRows failed for "${tab}": ${res.status} ${body.slice(0, 300)}`);
  }
  const result: number[] = [];
  for (let i = 0; i < rows.length; i++) result.push(target + i);
  return result;
}

/**
 * Read a single row from the destination tab as an array of cell values.
 */
export async function getDestRow(tab: string, rowNumber: number): Promise<(string | number)[]> {
  const sheetId = accountsSheetId();
  const { token } = await getAccessToken();
  const range = `${tab}!A${rowNumber}:AF${rowNumber}`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`getDestRow failed for ${tab} row ${rowNumber}: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  const row = data.values?.[0] ?? [];
  return row.map((c) => (c == null ? "" : (c as string | number)));
}

/**
 * Overwrite a single row at a known row number.
 */
export async function updateDestRow(
  tab: string,
  rowNumber: number,
  values: (string | number)[]
): Promise<void> {
  const sheetId = accountsSheetId();
  const { token } = await getAccessToken();
  const range = `${tab}!A${rowNumber}:AF${rowNumber}`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`updateDestRow failed for ${tab} row ${rowNumber}: ${res.status} ${body.slice(0, 200)}`);
  }
}

/* ------------------------------------------------------------------------- */
/* Legacy fetchSheet retained for inspect-headers script.                      */
/* ------------------------------------------------------------------------- */

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
