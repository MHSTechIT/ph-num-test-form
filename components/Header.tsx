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
      <div className="flex w-full items-center justify-end px-6 py-4">
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
