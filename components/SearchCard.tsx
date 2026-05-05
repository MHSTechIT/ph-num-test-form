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
    <section className="rounded-xl border bg-white p-6 shadow-sm">
      <p className="text-sm text-zinc-500">Enter a 10-digit Mobile Number</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <PhoneIcon />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="numeric"
            placeholder="Mobile (9626324237)"
            className="w-full rounded-md border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm font-mono outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !query.trim()}
          className="rounded-md bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
        >
          {submitting ? "Searching…" : "Get Details"}
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
