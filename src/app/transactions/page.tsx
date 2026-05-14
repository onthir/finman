import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { format } from "date-fns";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id!;
  const sp = await searchParams;

  const txns = await db.transaction.findMany({
    where: {
      userId,
      ...(sp.category ? { category: sp.category } : {}),
      ...(sp.q
        ? {
            OR: [
              { name: { contains: sp.q, mode: "insensitive" } },
              { merchantName: { contains: sp.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: 200,
    include: { finAccount: { select: { name: true, mask: true } } },
  });

  return (
    <>
      <AppNav email={session?.user?.email} />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Transactions
            </h1>
            <p className="text-sm text-stone-500">
              Showing {txns.length} most recent
            </p>
          </div>
          <form className="flex gap-2 text-sm">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search merchant"
                className="rounded-lg border border-stone-200 bg-white pl-8 pr-3 py-2 outline-none focus:border-stone-400 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
              />
            </div>
            <input
              name="category"
              defaultValue={sp.category ?? ""}
              placeholder="Category"
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 outline-none focus:border-stone-400 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
            />
            <button
              type="submit"
              className="rounded-lg bg-stone-900 text-white px-4 py-2 font-medium hover:bg-stone-800"
            >
              Filter
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500 bg-stone-50/60">
              <tr className="border-b border-stone-200">
                <th className="text-left px-5 py-3 font-medium">Date</th>
                <th className="text-left px-5 py-3 font-medium">Merchant</th>
                <th className="text-left px-5 py-3 font-medium">Account</th>
                <th className="text-left px-5 py-3 font-medium">Category</th>
                <th className="text-right px-5 py-3 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const n = Number(t.amount.toString());
                const isIncome = n < 0;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50"
                  >
                    <td className="px-5 py-3 text-stone-500 whitespace-nowrap">
                      {format(t.date, "MMM d")}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-stone-900">
                        {t.merchantName ?? t.name}
                      </div>
                      {t.pending && (
                        <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5">
                          pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-stone-500">
                      {t.finAccount.name} ••{t.finAccount.mask ?? "?"}
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {t.category ?? "—"}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-semibold tabular ${
                        isIncome ? "text-emerald-600" : "text-stone-900"
                      }`}
                    >
                      {isIncome ? `+${formatMoney(-n)}` : `−${formatMoney(n)}`}
                    </td>
                  </tr>
                );
              })}
              {txns.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-stone-500"
                  >
                    No transactions match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
