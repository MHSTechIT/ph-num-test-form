"use client";

import { useState } from "react";
import type { LookupResponse } from "@/app/api/lookup/route";
import type { AppendResponse } from "@/app/api/append/route";

type AddState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      tab: string;
      row: number;
      action: "appended" | "merged";
      filledColumns: number;
      warnings: string[];
    }
  | { kind: "error"; message: string };

export function AddToAccountsButton({ data }: { data: LookupResponse | null }) {
  const [state, setState] = useState<AddState>({ kind: "idle" });

  if (!data || data.results.length === 0) return null;

  async function send() {
    if (!data) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/append", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "all", query: data.query }),
      });
      const payload = (await res.json()) as AppendResponse;
      if (payload.ok) {
        setState({
          kind: "success",
          tab: payload.result.tab,
          row: payload.result.row,
          action: payload.result.action,
          filledColumns: payload.result.filledColumns,
          warnings: payload.warnings ?? [],
        });
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
        onClick={send}
        disabled={state.kind === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-300/40 transition hover:opacity-95 disabled:opacity-60"
      >
        {state.kind === "loading" ? (
          "Saving…"
        ) : (
          <>
            <span className="text-base leading-none">+</span> Add to Accounts
          </>
        )}
      </button>
      {state.kind === "success" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
          {state.action === "merged"
            ? `✓ Updated row ${state.row}${
                state.filledColumns > 0 ? ` · filled ${state.filledColumns} blank${state.filledColumns === 1 ? "" : "s"}` : " · already complete"
              }`
            : `✓ Added · ${state.tab} row ${state.row}`}
          {state.warnings.length > 0 ? (
            <span className="ml-2 text-amber-700">· {state.warnings.join(" · ")}</span>
          ) : null}
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
