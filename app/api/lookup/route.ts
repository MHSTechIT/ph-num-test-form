import { NextRequest, NextResponse } from "next/server";
import { runLookup, type LookupSheetResult } from "@/lib/google-sheets";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";

export type LookupRow = {
  classification: string | null;
  data: Record<string, unknown>;
};

export type SheetResult = LookupSheetResult;

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

  try {
    const data = await runLookup(phone);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bridge error" },
      { status: 502 }
    );
  }
}
