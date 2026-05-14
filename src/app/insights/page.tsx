import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { db } from "@/lib/db";
import { format } from "date-fns";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const insights = await db.insight.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <>
      <AppNav email={session?.user?.email} />
      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Insights
          </h1>
          <p className="text-sm text-stone-500">
            AI-generated summaries of your spending trends. Runs weekly.
          </p>
        </div>

        {insights.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <div className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm text-stone-500">
              No insights yet. They generate weekly once you have transaction
              data.
            </p>
          </div>
        ) : (
          insights.map((i) => (
            <article
              key={i.id}
              className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-stone-900">{i.title}</h2>
                <div className="text-xs text-stone-400">
                  {format(i.createdAt, "MMM d, yyyy")}
                </div>
              </div>
              <div className="mt-1 text-xs text-stone-500">
                {format(i.periodStart, "MMM d")} –{" "}
                {format(i.periodEnd, "MMM d")}
              </div>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-stone-700 leading-relaxed">
                {i.body}
              </pre>
            </article>
          ))
        )}
      </main>
    </>
  );
}
