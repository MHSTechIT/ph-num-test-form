import { NextRequest, NextResponse } from "next/server";
import {
  appendRows,
  getDestPhones,
  getPhoneIndex,
  type IndexEntry,
} from "@/lib/google-sheets";
import { buildDestRow, type MatchedEntry } from "@/lib/dest-mapping";
import { normalizePhone } from "@/lib/phone";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

type AppendRequest = {
  mode?: "single" | "all";
  query?: string;
  sheetName?: string;
  confirm?: boolean;
};

type AppendOk = {
  ok: true;
  appended: { tab: string; row: number }[];
  warnings: string[];
};
type AppendDuplicate = {
  ok: false;
  reason: "duplicate";
  existing: { tab: string; row: number }[];
};
type AppendNoMatches = { ok: false; reason: "no_matches" };
type AppendError = { ok: false; reason: "error"; message: string };
export type AppendResponse = AppendOk | AppendDuplicate | AppendNoMatches | AppendError;

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
  const confirm = body.confirm === true;

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

  // Build the row(s). For per-card adds, pass just that card's match.
  // For 'all' mode, pass all matches in one go (one consolidated row).
  let built;
  try {
    built = buildDestRow(toMatchedEntries(matches), phone);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "error", message: err instanceof Error ? err.message : "build error" },
      { status: 500 }
    );
  }

  // Duplicate scan
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
  const existing = phones.filter(([p]) => p === phone).map(([, r]) => ({ tab: built.tab, row: r }));
  if (existing.length > 0 && !confirm) {
    return NextResponse.json({ ok: false, reason: "duplicate", existing } satisfies AppendResponse, {
      status: 409,
    });
  }

  // Append
  let rowNums: number[] = [];
  try {
    rowNums = await appendRows(built.tab, [built.row]);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "error", message: err instanceof Error ? err.message : "append failed" },
      { status: 502 }
    );
  }
  // Bust the dest-phones cache so the next duplicate check reflects the new row.
  try {
    revalidateTag("dest-phones");
  } catch {
    // ignore
  }

  return NextResponse.json({
    ok: true,
    appended: rowNums.map((r) => ({ tab: built.tab, row: r })),
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
