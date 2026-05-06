import { unstable_cache } from "next/cache";
import { SHEETS, ALLOWED_CLASSIFICATIONS } from "./sheets-config";

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

function bridgeUrl(): URL {
  return new URL(requireEnv("APPS_SCRIPT_URL"));
}

function bridgeToken(): string {
  return requireEnv("APPS_SCRIPT_TOKEN");
}

async function fetchPhoneIndexUncached(): Promise<PhoneIndex> {
  const url = bridgeUrl();
  url.searchParams.set("action", "index");
  url.searchParams.set("token", bridgeToken());
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
  if (!res.ok) throw new Error(`Apps Script index failed: HTTP ${res.status}`);
  const payload = (await res.json()) as
    | { index: IndexEntry[]; errors: Array<{ sheet: string; message: string }> }
    | { error: string; message?: string };

  if ("error" in payload) {
    throw new Error(
      `Apps Script error: ${payload.error}${payload.message ? ` (${payload.message})` : ""}`
    );
  }

  return {
    index: payload.index || [],
    errors: (payload.errors || []).map((e) => ({ sheetName: e.sheet, message: e.message })),
    fetchedAt: Date.now(),
  };
}

/**
 * Cached phone index — small JSON (only matched rows), so it fits well under
 * Next.js's 2MB cache cap and TS-side filtering is sub-millisecond.
 *
 * First request after server cold-start (or after revalidate) pays the
 * Apps Script cost (~7-15s). All subsequent requests are instant.
 */
export const getPhoneIndex = unstable_cache(
  async () => fetchPhoneIndexUncached(),
  ["mhs-phone-index-v1"],
  { revalidate: 600, tags: ["phone-index"] }
);

export async function warmupBridge(): Promise<void> {
  await getPhoneIndex().catch(() => {});
}

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

/* Legacy fetchSheet retained only for inspect-headers. */
export async function fetchSheet(
  sheetName: string
): Promise<{ sheetName: string; headers: string[]; rows: Record<string, unknown>[] }> {
  const url = bridgeUrl();
  url.searchParams.set("action", "sheet");
  url.searchParams.set("name", sheetName);
  url.searchParams.set("token", bridgeToken());
  const res = await fetch(url.toString(), { redirect: "follow" });
  if (!res.ok) throw new Error(`Apps Script fetch failed: HTTP ${res.status}`);
  const payload = (await res.json()) as
    | { sheet: string; headers: string[]; values: string[][] }
    | { error: string };
  if ("error" in payload) throw new Error(payload.error);
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
