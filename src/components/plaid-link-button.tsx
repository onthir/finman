"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function PlaidLinkButton({ className }: { className?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/plaid/link", { method: "POST" });
      if (!res.ok) return;
      const { link_token } = (await res.json()) as { link_token: string };
      if (!cancelled) setToken(link_token);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSuccess = useCallback(
    async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setLoading(true);
      await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          public_token,
          institution: metadata.institution
            ? {
                institution_id: metadata.institution.institution_id,
                name: metadata.institution.name,
              }
            : undefined,
        }),
      });
      setLoading(false);
      router.refresh();
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
  });

  return (
    <button
      type="button"
      disabled={!ready || loading}
      onClick={() => open()}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-lg bg-stone-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-stone-800 disabled:opacity-50 shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition"
      }
    >
      <Plus className="h-4 w-4" />
      {loading ? "Connecting…" : "Connect account"}
    </button>
  );
}
