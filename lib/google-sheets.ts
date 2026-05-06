import { unstable_cache } from "next/cache";
import { SHEETS, ALLOWED_CLASSIFICATIONS, type SheetConfig } from "./sheets-config";

export type SheetData = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

export type LookupRow = {
  classification: string | null;
  data: Record<string, unknown>;
};

export type LookupSheetResult = {
  sheetName: string;
  displayName: string;
  highlightColumns: string[];
  matchedHeaders: string[];
  rows: LookupRow[];
};

export type LookupBridgeResponse = {
  query: string;
  results: LookupSheetResult[];
  errors: { sheetName: string; message: string }[];
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function bridgeUrl(): URL {
  return new URL(requireEnv("APPS_SCRIPT_URL"));
}

function bridgeToken(): string {
  return requireEnv("APPS_SCRIPT_TOKEN");
}

/**
 * Server-side lookup: pushes filtering into Apps Script so the response is tiny.
 */
export async function runLookup(phone: string): Promise<LookupBridgeResponse> {
  const url = bridgeUrl();
  url.searchParams.set("action", "lookup");
  url.searchParams.set("token", bridgeToken());
  url.searchParams.set("phone", phone);
  url.searchParams.set("classifications", ALLOWED_CLASSIFICATIONS.join(","));
  url.searchParams.set(
    "sheets",
    JSON.stringify(
      SHEETS.map((s) => ({
        name: s.sheetName,
        displayName: s.displayName,
        phoneColumnHints: s.phoneColumnHints ?? [],
      }))
    )
  );

  const res = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  if (!res.ok) throw new Error(`Apps Script lookup failed: HTTP ${res.status}`);
  const payload = (await res.json()) as
    | {
        query: string;
        results: Array<{
          sheet: string;
          displayName: string;
          matchedHeaders: string[];
          rows: LookupRow[];
        }>;
        errors: Array<{ sheet: string; message: string }>;
      }
    | { error: string; message?: string };

  if ("error" in payload) {
    throw new Error(
      `Apps Script error: ${payload.error}${payload.message ? ` (${payload.message})` : ""}`
    );
  }

  const cfgByName = new Map<string, SheetConfig>();
  for (const s of SHEETS) cfgByName.set(s.sheetName, s);

  const results: LookupSheetResult[] = payload.results.map((r) => ({
    sheetName: r.sheet,
    displayName: r.displayName,
    highlightColumns: cfgByName.get(r.sheet)?.highlightColumns ?? [],
    matchedHeaders: r.matchedHeaders,
    rows: r.rows,
  }));
  return {
    query: payload.query,
    results,
    errors: payload.errors.map((e) => ({ sheetName: e.sheet, message: e.message })),
  };
}

export async function warmupBridge(): Promise<void> {
  const url = bridgeUrl();
  url.searchParams.set("action", "tabs");
  url.searchParams.set("token", bridgeToken());
  await fetch(url.toString(), { method: "GET", redirect: "follow" }).catch(() => {});
}

/* ------------------------------------------------------------------------- */
/* Legacy helpers used by the inspect-headers script.                         */
/* ------------------------------------------------------------------------- */

async function fetchSheetUncached(sheetName: string): Promise<SheetData> {
  const url = bridgeUrl();
  url.searchParams.set("action", "sheet");
  url.searchParams.set("name", sheetName);
  url.searchParams.set("token", bridgeToken());

  const res = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  if (!res.ok) throw new Error(`Apps Script fetch failed for "${sheetName}": HTTP ${res.status}`);
  const payload = (await res.json()) as
    | { sheet: string; headers: string[]; values: string[][] }
    | { error: string; message?: string };

  if ("error" in payload) {
    throw new Error(
      `Apps Script error for "${sheetName}": ${payload.error}${
        payload.message ? ` (${payload.message})` : ""
      }`
    );
  }

  const headers = (payload.headers ?? []).map((h) => (h == null ? "" : String(h)));
  const rows: Record<string, unknown>[] = [];
  for (const raw of payload.values ?? []) {
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

export const fetchSheet = unstable_cache(
  async (sheetName: string) => fetchSheetUncached(sheetName),
  ["mhs-sheet-v3"],
  { revalidate: 300, tags: ["sheets"] }
);

export async function fetchTabs(): Promise<string[]> {
  const url = bridgeUrl();
  url.searchParams.set("action", "tabs");
  url.searchParams.set("token", bridgeToken());
  const res = await fetch(url.toString(), { redirect: "follow" });
  if (!res.ok) throw new Error(`Apps Script tabs fetch failed: HTTP ${res.status}`);
  const payload = (await res.json()) as { tabs?: string[]; error?: string };
  if (payload.error) throw new Error(`Apps Script error: ${payload.error}`);
  return payload.tabs ?? [];
}
