import { NextRequest, NextResponse } from "next/server";
import {
  appendRows,
  getDestPhones,
  getDestRow,
  getPhoneIndex,
  updateDestRow,
  type IndexEntry,
} from "@/lib/google-sheets";
import { buildDestRow, mergeRows, type MatchedEntry } from "@/lib/dest-mapping";
import { normalizePhone } from "@/lib/phone";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

type AppendRequest = {
  mode?: "single" | "all";
  query?: string;
  sheetName?: string;
};

type AppendOk = {
  ok: true;
  result: {
    tab: string;
    row: number;
    action: "appended" | "merged";
    filledColumns: number;
  };
  warnings: string[];
};
type AppendNoMatches = { ok: false; reason: "no_matches" };
type AppendError = { ok: false; reason: "error"; message: string };
export type AppendResponse = AppendOk | AppendNoMatches | AppendError;

export async function POST(req: NextRequest) {
  let body: AppendRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "error", message: "invalid body" } satisfies AppendResponse,
      { status: 400 }
    );
  }

  const phone = normalizePhone(body.query ?? "");
  if (!phone) {
    return NextResponse.json(
      { ok: false, reason: "error", message: "Enter a 10-digit mobile number." },
      { status: 400 }
    );
  }
  const mode = body.mode === "single" ? "single" : "all";

  let index;
  try {
    index = await getPhoneIndex();
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "error", message: err instanceof Error ? err.message : "index error" },
      { status: 502 }
    );
  }

  let matches = index.index.filter((e) => e.phone === phone);
  if (mode === "single") {
    if (!body.sheetName) {
      return NextResponse.json(
        { ok: false, reason: "error", message: "sheetName required when mode=single" },
        { status: 400 }
      );
    }
    matches = matches.filter((e) => e.sheet === body.sheetName);
  }

  if (matches.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_matches" } satisfies AppendResponse, {
      status: 404,
    });
  }

  let built;
  try {
    built = buildDestRow(toMatchedEntries(matches), phone);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "error", message: err instanceof Error ? err.message : "build error" },
      { status: 500 }
    );
  }

  // Look for an existing row with this phone in the target tab.
  let phones: Array<[string, number]> = [];
  try {
    phones = await getDestPhones(built.tab);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: "error",
        message: err instanceof Error ? err.message : "duplicate scan failed",
      },
      { status: 502 }
    );
  }
  const existing = phones.filter(([p]) => p === phone).map(([, r]) => r);

  // === Merge path: phone already in destination -> fill blanks of existing row ===
  if (existing.length > 0) {
    const targetRow = existing[0]; // first existing row; later ones would be merged on subsequent clicks
    let mergedFilled = 0;
    try {
      const existingRow = await getDestRow(built.tab, targetRow);
      const { merged, filled } = mergeRows(existingRow, built.row);
      mergedFilled = filled.length;
      if (filled.length > 0) {
        await updateDestRow(built.tab, targetRow, merged);
      }
    } catch (err) {
      return NextResponse.json(
        { ok: false, reason: "error", message: err instanceof Error ? err.message : "merge failed" },
        { status: 502 }
      );
    }
    try {
      revalidateTag("dest-phones");
    } catch {
      // ignore
    }
    return NextResponse.json({
      ok: true,
      result: { tab: built.tab, row: targetRow, action: "merged", filledColumns: mergedFilled },
      warnings: built.warnings,
    } satisfies AppendResponse);
  }

  // === Append path: brand-new entry ===
  let rowNums: number[] = [];
  try {
    rowNums = await appendRows(built.tab, [built.row]);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "error", message: err instanceof Error ? err.message : "append failed" },
      { status: 502 }
    );
  }
  try {
    revalidateTag("dest-phones");
  } catch {
    // ignore
  }

  // Count non-empty cells we actually wrote.
  let filledColumns = 0;
  for (const v of built.row) {
    if (v != null && String(v).trim() !== "") filledColumns += 1;
  }

  return NextResponse.json({
    ok: true,
    result: { tab: built.tab, row: rowNums[0], action: "appended", filledColumns },
    warnings: built.warnings,
  } satisfies AppendResponse);
}

function toMatchedEntries(entries: IndexEntry[]): MatchedEntry[] {
  return entries.map((e) => ({
    sheet: e.sheet,
    displayName: e.displayName,
    classification: e.classification as MatchedEntry["classification"],
    data: e.data,
  }));
}
