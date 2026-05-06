import type { SheetResult } from "@/app/api/lookup/route";

const CLASS_LABEL: Record<string, string> = {
  "002": "L2 Application",
  "003": "L2 Diamond",
  "004": "L2 Gold",
  "005": "L2 EMI",
};

export function ResultCard({ result }: { result: SheetResult; query?: string }) {
  return (
    <article className="rounded-3xl border border-violet-200/60 bg-white/85 p-6 shadow-[0_10px_40px_-24px_rgba(124,58,237,0.25)] backdrop-blur">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 items-center rounded-full bg-violet-100/80 px-3 text-xs font-semibold uppercase tracking-wider text-violet-700">
            {result.displayName}
          </span>
          <span className="text-xs text-zinc-500">
            {result.rows.length} {result.rows.length === 1 ? "row" : "rows"}
          </span>
        </div>
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
    <div className="rounded-2xl border border-zinc-100 bg-gradient-to-br from-white to-violet-50/30 p-4">
      {classification ? (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {classification}
          {CLASS_LABEL[classification] ? (
            <span className="font-normal text-emerald-600">· {CLASS_LABEL[classification]}</span>
          ) : null}
        </div>
      ) : null}
      {highlighted.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {highlighted.map(([k, v]) => (
            <Field key={k} label={k} value={v} />
          ))}
        </dl>
      ) : null}
      {rest.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-violet-600 hover:text-violet-800">
            Show all fields ({rest.length})
          </summary>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
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
    <div className="min-w-0 border-b border-dashed border-zinc-200/70 py-1 last:border-b-0">
      <dt className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="break-words text-sm text-zinc-900">{formatValue(value)}</dd>
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
