import type { SheetResult } from "@/app/api/lookup/route";

export function ResultCard({ result }: { result: SheetResult }) {
  return (
    <article className="rounded-xl border bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">{result.displayName}</h3>
        <span className="text-xs text-zinc-500">
          {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="space-y-4">
        {result.rows.map((row, idx) => (
          <RowBlock
            key={idx}
            data={row.data}
            classification={row.classification}
            highlight={result.highlightColumns}
          />
        ))}
      </div>
    </article>
  );
}

function RowBlock({
  data,
  classification,
  highlight,
}: {
  data: Record<string, unknown>;
  classification: string | null;
  highlight: string[];
}) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== "" && v !== undefined);
  const highlighted = entries.filter(([k]) => highlight.includes(k));
  const rest = entries.filter(([k]) => !highlight.includes(k));

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/40 p-3">
      {classification ? (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
          {classification}
        </div>
      ) : null}
      {highlighted.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {highlighted.map(([k, v]) => (
            <Field key={k} label={k} value={v} />
          ))}
        </dl>
      ) : null}
      {rest.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700">
            Show all fields ({rest.length})
          </summary>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {rest.map(([k, v]) => (
              <Field key={k} label={k} value={v} />
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 border-b border-dashed border-zinc-200 py-1 last:border-b-0">
      <dt className="truncate text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="break-words text-sm text-zinc-800">{formatValue(value)}</dd>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v) && Math.abs(v) >= 1e9) return String(v);
    return new Intl.NumberFormat("en-IN").format(v);
  }
  return String(v);
}
