"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { SearchCard } from "@/components/SearchCard";
import { ResultGrid } from "@/components/ResultGrid";
import { AddToAccountsButton } from "@/components/AddToAccountsButton";
import type { LookupResponse } from "@/app/api/lookup/route";

type View = "idle" | "transitioning" | "results";

const ZOOM_DURATION_MS = 800;

export default function HomePage() {
  const [view, setView] = useState<View>("idle");
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingResultRef = useRef<LookupResponse | null>(null);
  const pendingErrorRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/warmup", { keepalive: true }).catch(() => {});
  }, []);

  function handleResult(r: LookupResponse) {
    pendingResultRef.current = r;
    pendingErrorRef.current = null;
  }

  function handleError(message: string) {
    pendingErrorRef.current = message;
    pendingResultRef.current = null;
  }

  function handleTransitionStart() {
    setView("transitioning");
    setError(null);
    setTimeout(() => {
      setData(pendingResultRef.current);
      setError(pendingErrorRef.current);
      setView("results");
    }, ZOOM_DURATION_MS);
  }

  function searchAgain() {
    setView("idle");
    setData(null);
    setError(null);
  }

  const showHero = view === "idle" || view === "transitioning";

  return (
    <>
      <Header />

      {showHero ? (
        <main className="flex min-h-[calc(100vh-72px)] items-center justify-center px-6 pb-12">
          <div className="hero-float relative w-full max-w-3xl">
            <div className="hero-glow relative">
              <div className={view === "transitioning" ? "card-zoom-pop" : ""}>
                <SearchCard
                  hero
                  lastResult={null}
                  onLoadingChange={setLoading}
                  onShatterStart={handleTransitionStart}
                  onResult={handleResult}
                  onError={handleError}
                />
              </div>
            </div>
          </div>
        </main>
      ) : null}

      {view === "results" ? (
        <main className="results-fade-in mx-auto max-w-5xl px-6 py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <AddToAccountsButton data={data} />
            <button
              onClick={searchAgain}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-violet-300/40 transition hover:opacity-95"
            >
              <SearchAgainIcon />
              Search Again
            </button>
          </div>
          <ResultGrid data={data} loading={loading} error={error} />
        </main>
      ) : null}
    </>
  );
}

function SearchAgainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
      <path
        d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
