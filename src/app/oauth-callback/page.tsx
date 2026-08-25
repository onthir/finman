"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const LINK_TOKEN_KEY = "finman:plaid_link_token";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"resuming" | "saving" | "error">(
    "resuming",
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(LINK_TOKEN_KEY);
      if (!t) {
        setStatus("error");
        setErrorMsg("Missing link token. Start the connection again.");
        return;
      }
      setToken(t);
    } catch {
      setStatus("error");
      setErrorMsg("Browser storage unavailable.");
    }
  }, []);

  const onSuccess = useCallback(
    async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setStatus("saving");
      try {
        sessionStorage.removeItem(LINK_TOKEN_KEY);
      } catch {
        /* ignore */
      }
      const res = await fetch("/api/plaid/exchange", {
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
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(`Exchange failed: ${res.status}`);
        return;
      }
      router.replace("/");
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    receivedRedirectUri:
      typeof window !== "undefined" ? window.location.href : undefined,
  });

  useEffect(() => {
    if (ready && token) open();
  }, [ready, token, open]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-white to-indigo-50/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
        {status === "error" ? (
          <>
            <h1 className="text-lg font-semibold text-stone-900">
              Couldn&apos;t finish connecting
            </h1>
            <p className="mt-2 text-sm text-stone-500">{errorMsg}</p>
            <a
              href="/"
              className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Back to dashboard
            </a>
          </>
        ) : (
          <>
            <div className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-stone-900">
              {status === "saving" ? "Saving your accounts…" : "Finishing connection…"}
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              Don&apos;t close this tab.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
