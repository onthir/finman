import { signIn } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/";

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-white to-indigo-50/40 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
          <div className="flex items-center gap-2">
            <span className="inline-grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-bold">
              ƒ
            </span>
            <span className="text-xl font-bold tracking-tight text-stone-900">
              FinMan
            </span>
          </div>
          <p className="mt-4 text-sm text-stone-500">
            Sign in with a magic link sent to your email.
          </p>

          <form
            action={async (formData) => {
              "use server";
              await signIn("resend", {
                email: formData.get("email"),
                redirectTo: callbackUrl,
              });
            }}
            className="mt-6 space-y-3"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-stone-900 text-white text-sm font-semibold px-3 py-2.5 hover:bg-stone-800 transition"
            >
              Send magic link
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
