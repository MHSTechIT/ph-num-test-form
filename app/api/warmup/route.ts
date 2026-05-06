import { NextResponse } from "next/server";
import { warmupBridge } from "@/lib/google-sheets";

export const runtime = "nodejs";

export async function GET() {
  try {
    await warmupBridge();
    return new NextResponse(null, { status: 204 });
  } catch {
    // Warmup failures are not user-visible; just respond 204 anyway.
    return new NextResponse(null, { status: 204 });
  }
}
