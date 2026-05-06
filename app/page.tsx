"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { SearchCard } from "@/components/SearchCard";
import { ResultGrid } from "@/components/ResultGrid";
import type { LookupResponse } from "@/app/api/lookup/route";

export default function HomePage() {
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wake the Apps Script container so the first lookup is fast.
    fetch("/api/warmup", { keepalive: true }).catch(() => {});
  }, []);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <SearchCard
          onResult={(r) => {
            setData(r);
            setError(null);
          }}
          onError={(m) => {
            setError(m);
            setData(null);
          }}
          onLoadingChange={setLoading}
        />
        <ResultGrid data={data} loading={loading} error={error} />
      </main>
    </>
  );
}
