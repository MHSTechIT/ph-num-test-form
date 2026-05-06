import { NextRequest, NextResponse } from "next/server";
import { getPhoneIndex, type IndexEntry } from "@/lib/google-sheets";
import { SHEETS } from "@/lib/sheets-config";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";

export type LookupRow = {
  classification: string | null;
  data: Record<string, unknown>;
};

export type SheetResult = {
  sheetName: string;
  displayName: string;
  highlightColumns: string[];
  matchedHeaders: string[];
  rows: LookupRow[];
};

export type LookupResponse = {
  query: string;
  results: SheetResult[];
  errors: { sheetName: string; message: string }[];
};

export async function POST(req: NextRequest) {
  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const raw = (body.query ?? "").toString().trim();
  const phone = normalizePhone(raw);
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a 10-digit mobile number." },
      { status: 400 }
    );
  }

  let index;
  try {
    index = await getPhoneIndex();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bridge error" },
      { status: 502 }
    );
  }

  const matches = index.index.filter((e) => e.phone === phone);
  const grouped = groupBySheet(matches);
  const results: SheetResult[] = [];
  const cfgByName = new Map(SHEETS.map((s) => [s.sheetName, s]));

  for (const [sheetName, entries] of grouped) {
    const cfg = cfgByName.get(sheetName);
    if (!cfg) continue; // sheet was removed from in-scope after index was built
    const matchedHeaders = Array.from(new Set(entries.map((e) => e.matchedHeader)));
    results.push({
      sheetName,
      displayName: entries[0].displayName,
      highlightColumns: cfg.highlightColumns ?? [],
      matchedHeaders,
      rows: entries.map((e) => ({ classification: e.classification, data: e.data })),
    });
  }

  // Preserve SHEETS order in the result
  results.sort(
    (a, b) =>
      SHEETS.findIndex((s) => s.sheetName === a.sheetName) -
      SHEETS.findIndex((s) => s.sheetName === b.sheetName)
  );

  return NextResponse.json({ query: phone, results, errors: index.errors });
}

function groupBySheet(entries: IndexEntry[]): Map<string, IndexEntry[]> {
  const m = new Map<string, IndexEntry[]>();
  for (const e of entries) {
    const arr = m.get(e.sheet);
    if (arr) arr.push(e);
    else m.set(e.sheet, [e]);
  }
  return m;
}
