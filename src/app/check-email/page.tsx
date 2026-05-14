import { Mail } from "lucide-react";

export default function CheckEmailPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-white to-indigo-50/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
        <div className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Mail className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-stone-900">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          We sent a sign-in link. Open it on this device to continue.
        </p>
        <p className="mt-6 text-xs text-stone-400">
          Didn&apos;t get it?{" "}
          <a href="/signin" className="text-stone-700 underline">
            Try again
          </a>
          .
        </p>
      </div>
    </main>
  );
}
