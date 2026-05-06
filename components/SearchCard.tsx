"use client";

import { useState } from "react";

export type SearchCardProps = {
  onResult: (data: import("@/app/api/lookup/route").LookupResponse) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
};

export function SearchCard({ onResult, onError, onLoadingChange }: SearchCardProps) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = query.trim();
    if (!cleaned) return;
    setSubmitting(true);
    onLoadingChange(true);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: cleaned }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        onError(payload.error || `Request failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as import("@/app/api/lookup/route").LookupResponse;
      onResult(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
      onLoadingChange(false);
    }
  }

  return (
    <section className="rounded-3xl border border-violet-200/70 bg-white/80 p-7 shadow-[0_10px_40px_-20px_rgba(124,58,237,0.25)] backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-wider text-violet-600/80">Customer lookup</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-900">Enter a 10-digit Mobile Number</h2>
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-400">
            <PhoneIcon />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="numeric"
            placeholder="9626324237"
            className="w-full rounded-full border border-violet-200/80 bg-white py-3 pl-11 pr-4 text-sm font-mono tracking-wide text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !query.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-medium text-white shadow-md shadow-violet-300/40 transition hover:opacity-95 disabled:opacity-60"
        >
          {submitting ? "Searching…" : "Get Details"}
          {!submitting ? <ArrowIcon /> : null}
        </button>
      </form>
    </section>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M22 16.92V21a1 1 0 0 1-1.11 1A19.86 19.86 0 0 1 2 4.11 1 1 0 0 1 3 3h4.09a1 1 0 0 1 1 .75c.13.6.32 1.18.56 1.74a1 1 0 0 1-.22 1.11L7.21 8.21a16 16 0 0 0 8.58 8.58l1.61-1.22a1 1 0 0 1 1.11-.22c.56.24 1.14.43 1.74.56a1 1 0 0 1 .75 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
