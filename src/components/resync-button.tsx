"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { resyncAll } from "@/lib/actions";

export function ResyncButton() {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const r = await resyncAll();
          setDone(`Queued sync for ${r.queued} institution(s)`);
          setTimeout(() => setDone(null), 4000);
        })
      }
      className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition"
    >
      <RefreshCw
        className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
      />
      {done ?? (isPending ? "Syncing…" : "Resync")}
    </button>
  );
}
