"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function UnlinkButton({ itemId, institutionName }: { itemId: string; institutionName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleUnlink() {
    setLoading(true);
    await fetch(`/api/plaid/items/${itemId}`, { method: "DELETE" });
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-500">Remove {institutionName}?</span>
        <button
          onClick={handleUnlink}
          disabled={loading}
          className="rounded-md bg-rose-600 text-white text-xs font-medium px-2.5 py-1.5 hover:bg-rose-700 disabled:opacity-50 transition"
        >
          {loading ? "Removing…" : "Yes, remove"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md border border-stone-200 text-xs font-medium px-2.5 py-1.5 text-stone-600 hover:bg-stone-50 transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:border-rose-300 hover:text-rose-600 transition"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Unlink
    </button>
  );
}
