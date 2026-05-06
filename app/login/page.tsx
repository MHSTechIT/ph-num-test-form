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
      <div className="rounded-3xl border border-violet-200/70 bg-white/85 p-7 shadow-[0_10px_40px_-20px_rgba(124,58,237,0.25)] backdrop-blur">
        <p className="text-xs font-medium uppercase tracking-wider text-violet-600/80">Sign In</p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900">Enter the shared password</h1>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Password</label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-full border border-violet-200/80 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-violet-300/40 transition hover:opacity-95 disabled:opacity-60"
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
