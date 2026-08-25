"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";
import type { TxnSearchParams } from "@/lib/transactions";

export function ExplainButton({ params }: { params: TxnSearchParams }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setText(null);
    try {
      const res = await fetch("/api/explain/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? `HTTP ${res.status}`);
      } else {
        setText(body.explanation);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-sm font-medium px-3.5 py-2 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-60 shadow-[0_1px_2px_rgba(99,102,241,0.25)] transition"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {loading ? "Thinking…" : "Explain"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 backdrop-blur-sm px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-white to-indigo-50 p-6 shadow-[0_12px_40px_rgba(99,102,241,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                <span className="inline-grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                AI explanation
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-100"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 min-h-[5rem]">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  Looking at your transactions…
                </div>
              )}
              {error && (
                <p className="text-sm text-rose-700">Error: {error}</p>
              )}
              {text && (
                <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                  {text}
                </p>
              )}
            </div>

            {!loading && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={run}
                  className="rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:from-indigo-600 hover:to-violet-600"
                >
                  Re-explain
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
