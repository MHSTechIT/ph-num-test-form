import type { LookupResponse } from "@/app/api/lookup/route";
import { ResultCard } from "./ResultCard";

export function ResultGrid({
  data,
  loading,
  error,
}: {
  data: LookupResponse | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="mt-6 rounded-3xl border border-violet-200/70 bg-white/70 p-12 text-center text-sm text-zinc-500 backdrop-blur">
        <span className="inline-block animate-pulse text-violet-600">Searching across all sheets…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  if (data.results.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-violet-200/60 bg-white/80 p-12 text-center backdrop-blur">
        <p className="text-sm font-semibold text-zinc-800">No matching invoice found</p>
        <p className="mt-1 text-xs text-zinc-500">
          We searched every payment source for {data.query} but didn&apos;t find a row classified
          002–005.
        </p>
        {data.errors.length > 0 ? (
          <p className="mt-3 text-xs text-amber-700">
            {data.errors.length} sheet{data.errors.length === 1 ? "" : "s"} could not be read; check
            server logs.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {data.results.map((r) => (
        <ResultCard key={r.sheetName} result={r} />
      ))}
      {data.errors.length > 0 ? (
        <div className="col-span-full rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800">
          Could not read: {data.errors.map((e) => e.sheetName).join(", ")}
        </div>
      ) : null}
    </div>
  );
}
