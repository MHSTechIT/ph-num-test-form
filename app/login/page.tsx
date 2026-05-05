"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Header } from "@/components/Header";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const from = search.get("from") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError("Incorrect password");
      setLoading(false);
      return;
    }
    router.replace(from);
    router.refresh();
  }

  return (
    <main className="mx-auto mt-16 max-w-md px-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">Sign In</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Enter the shared password to access the dashboard.
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-700">Password</label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-md bg-gradient-to-r from-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <>
      <Header showSignOut={false} />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
