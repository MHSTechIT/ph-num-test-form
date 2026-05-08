"use client";

import { useState } from "react";
import type { LookupResponse } from "@/app/api/lookup/route";
import type { AppendResponse } from "@/app/api/append/route";

type AddState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; tab: string; row: number; warnings: string[] }
  | { kind: "duplicate"; tab: string; row: number }
  | { kind: "error"; message: string };

export function AddToAccountsButton({ data }: { data: LookupResponse | null }) {
  const [state, setState] = useState<AddState>({ kind: "idle" });

  if (!data || data.results.length === 0) return null;

  async function send(confirm: boolean) {
    if (!data) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/append", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "all", query: data.query, confirm }),
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
        setState({ kind: "error", message: "No matches to add." });
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
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => send(false)}
        disabled={state.kind === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-300/40 transition hover:opacity-95 disabled:opacity-60"
      >
        {state.kind === "loading" ? (
          "Adding…"
        ) : (
          <>
            <span className="text-base leading-none">+</span> Add to Accounts
          </>
        )}
      </button>
      {state.kind === "success" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
          ✓ Added · {state.tab} row {state.row}
          {state.warnings.length > 0 ? (
            <span className="ml-2 text-amber-700">· {state.warnings.join(" · ")}</span>
          ) : null}
        </span>
      ) : null}
      {state.kind === "duplicate" ? (
        <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          Already in {state.tab} row {state.row}.
          <button
            onClick={() => setState({ kind: "idle" })}
            className="rounded-full border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100"
          >
            Cancel
          </button>
          <button
            onClick={() => send(true)}
            className="rounded-full bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700"
          >
            Add anyway
          </button>
        </span>
      ) : null}
      {state.kind === "error" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
