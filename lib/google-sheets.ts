import { unstable_cache } from "next/cache";

export type SheetData = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function fetchSheetUncached(sheetName: string): Promise<SheetData> {
  const baseUrl = requireEnv("APPS_SCRIPT_URL");
  const token = requireEnv("APPS_SCRIPT_TOKEN");
  const url = new URL(baseUrl);
  url.searchParams.set("action", "sheet");
  url.searchParams.set("name", sheetName);
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Apps Script fetch failed for "${sheetName}": HTTP ${res.status}`);
  }
  const payload = (await res.json()) as
    | { sheet: string; headers: string[]; values: string[][] }
    | { error: string; message?: string; name?: string };

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
  ["mhs-sheet-v2"],
  { revalidate: 300, tags: ["sheets"] }
);

export async function fetchTabs(): Promise<string[]> {
  const baseUrl = requireEnv("APPS_SCRIPT_URL");
  const token = requireEnv("APPS_SCRIPT_TOKEN");
  const url = new URL(baseUrl);
  url.searchParams.set("action", "tabs");
  url.searchParams.set("token", token);
  const res = await fetch(url.toString(), { redirect: "follow" });
  if (!res.ok) throw new Error(`Apps Script tabs fetch failed: HTTP ${res.status}`);
  const payload = (await res.json()) as { tabs?: string[]; error?: string };
  if (payload.error) throw new Error(`Apps Script error: ${payload.error}`);
  return payload.tabs ?? [];
}
