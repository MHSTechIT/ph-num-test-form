import { NextRequest, NextResponse } from "next/server";
import { fetchSheet } from "@/lib/google-sheets";
import {
  SHEETS,
  findClassificationInRow,
  findPhoneHeaders,
  isAllowedClassification,
  type SheetConfig,
} from "@/lib/sheets-config";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const settled = await Promise.allSettled(
    SHEETS.map(async (cfg) => ({ cfg, sheet: await fetchSheet(cfg.sheetName) }))
  );

  const results: SheetResult[] = [];
  const errors: { sheetName: string; message: string }[] = [];

  for (let i = 0; i < settled.length; i++) {
    const cfg = SHEETS[i];
    const r = settled[i];
    if (r.status === "rejected") {
      errors.push({
        sheetName: cfg.sheetName,
        message: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
      continue;
    }
    const matched = matchSheet(cfg, r.value.sheet, phone);
    if (matched.rows.length > 0) results.push(matched);
  }

  const response: LookupResponse = { query: phone, results, errors };
  return NextResponse.json(response);
}

function matchSheet(
  cfg: SheetConfig,
  sheet: { headers: string[]; rows: Record<string, unknown>[] },
  phone: string
): SheetResult {
  const phoneHeaders = findPhoneHeaders(sheet.headers, cfg.phoneColumnHints ?? []);
  const matchedHeaders: Set<string> = new Set();
  const rows: LookupRow[] = [];
  for (const row of sheet.rows) {
    let hit: string | null = null;
    for (const h of phoneHeaders) {
      const candidate = normalizePhone(row[h]);
      if (candidate && candidate === phone) {
        hit = h;
        break;
      }
    }
    if (!hit) continue;
    const classification = findClassificationInRow(row);
    if (!isAllowedClassification(classification)) continue;
    matchedHeaders.add(hit);
    rows.push({ classification, data: row });
  }
  return {
    sheetName: cfg.sheetName,
    displayName: cfg.displayName,
    highlightColumns: cfg.highlightColumns ?? [],
    matchedHeaders: [...matchedHeaders],
    rows,
  };
}
