"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Header({ showSignOut = true }: { showSignOut?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="bg-transparent">
      <div className="flex w-full items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-sm shadow-violet-200">
            <ButterflyIcon />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-zinc-900">My Health School</div>
            <div className="text-xs text-zinc-500">Invoice Generator</div>
          </div>
        </div>
        {showSignOut ? (
          <button
            onClick={signOut}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-violet-200/70 bg-white/80 px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur transition hover:border-violet-300 hover:text-zinc-900 disabled:opacity-60"
          >
            <SignOutIcon />
            {loading ? "Signing out…" : "Sign Out"}
          </button>
        ) : null}
      </div>
    </header>
  );
}

function ButterflyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5">
      <path
        d="M12 12c-1.5-3-4-5-7-5-1.7 0-3 1.3-3 3 0 4 4 7 10 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 12c1.5-3 4-5 7-5 1.7 0 3 1.3 3 3 0 4-4 7-10 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 7v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
      <path
        d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
