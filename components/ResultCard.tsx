"use client";

import { useState } from "react";
import type { SheetResult } from "@/app/api/lookup/route";
import type { AppendResponse } from "@/app/api/append/route";

const CLASS_LABEL: Record<string, string> = {
  "002": "L2 Application",
  "003": "L2 Diamond",
  "004": "L2 Gold",
  "005": "L2 EMI",
};

type AddState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; tab: string; row: number; warnings: string[] }
  | { kind: "duplicate"; tab: string; row: number }
  | { kind: "error"; message: string };

export function ResultCard({ result, query }: { result: SheetResult; query: string }) {
  const [state, setState] = useState<AddState>({ kind: "idle" });

  async function add(confirm = false) {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/append", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "single",
          query,
          sheetName: result.sheetName,
          confirm,
        }),
      });
      const payload = (await res.json()) as AppendResponse;
      if (payload.ok) {
        const first = payload.appended[0];
        setState({
          kind: "success",
          tab: first.tab,
          row: first.row,
          warnings: payload.warnings ?? [],
        });
      } else if (payload.reason === "duplicate") {
        const e = payload.existing[0];
        setState({ kind: "duplicate", tab: e.tab, row: e.row });
      } else if (payload.reason === "no_matches") {
        setState({ kind: "error", message: "No matches for this query." });
      } else {
        setState({
          kind: "error",
          message: "message" in payload ? payload.message : "Append failed",
        });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

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
        <AddButton state={state} onAdd={() => add(false)} onConfirm={() => add(true)} onReset={() => setState({ kind: "idle" })} />
      </header>

      <AddBanner state={state} onConfirm={() => add(true)} onCancel={() => setState({ kind: "idle" })} />

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

function AddButton({
  state,
  onAdd,
  onConfirm: _onConfirm,
  onReset,
}: {
  state: AddState;
  onAdd: () => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <button
        disabled
        className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-600"
      >
        Adding…
      </button>
    );
  }
  if (state.kind === "success") {
    return (
      <button
        onClick={onReset}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
        title="Click to reset"
      >
        ✓ Added · row {state.row}
      </button>
    );
  }
  return (
    <button
      onClick={onAdd}
      className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
    >
      <span className="text-sm leading-none">+</span> Add to Accounts
    </button>
  );
}

function AddBanner({
  state,
  onConfirm,
  onCancel,
}: {
  state: AddState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (state.kind === "duplicate") {
    return (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
        <span>
          Phone already exists in <strong>{state.tab}</strong> at row {state.row}. Add anyway?
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-amber-300 bg-white px-3 py-1 text-amber-800 hover:bg-amber-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700"
          >
            Add anyway
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="mb-3 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-700">
        {state.message}
      </div>
    );
  }
  if (state.kind === "success" && state.warnings.length > 0) {
    return (
      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
        {state.warnings.join(" · ")}
      </div>
    );
  }
  return null;
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
