import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { db } from "@/lib/db";
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from "date-fns";
import { BudgetEditor } from "@/components/budget-editor";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id!;
  const sp = await searchParams;

  const month = sp.month ? startOfMonth(parseISO(sp.month)) : startOfMonth(new Date());
  const monthEnd = endOfMonth(month);

  const budget = await db.budget.upsert({
    where: { userId_month: { userId, month } },
    create: { userId, month },
    update: {},
    include: { categories: { orderBy: { createdAt: "asc" } } },
  });

  // Build 6-month window: 5 prior months + current
  const historyStart = startOfMonth(subMonths(month, 5));
  const monthSlots = Array.from({ length: 6 }, (_, i) => {
    const m = subMonths(month, 5 - i);
    return { start: startOfMonth(m), end: endOfMonth(m), key: format(m, "yyyy-MM") };
  });

  const [transactions, historyTxns] = await Promise.all([
    db.transaction.findMany({
      where: { userId, date: { gte: month, lte: monthEnd } },
      orderBy: { date: "desc" },
      include: { finAccount: { select: { name: true, mask: true } } },
    }),
    db.transaction.findMany({
      where: { userId, date: { gte: historyStart, lte: monthEnd } },
      select: { amount: true, category: true, budgetCategoryId: true, date: true },
    }),
  ]);

  // Compute actual spend per budget category
  const catNameToId = new Map(budget.categories.map((c) => [c.name.toLowerCase(), c.id]));

  const categories = budget.categories.map((cat) => {
    const matched = transactions.filter((t) => {
      const n = Number(t.amount.toString());
      if (n < 0) return false;
      if (t.budgetCategoryId === cat.id) return true;
      if (!t.budgetCategoryId && t.category?.toLowerCase() === cat.name.toLowerCase()) return true;
      return false;
    });

    // 6-month sparkline
    const monthlySpend = monthSlots.map(({ start, end }) => {
      return historyTxns
        .filter((t) => {
          const n = Number(t.amount.toString());
          if (n < 0) return false;
          if (t.date < start || t.date > end) return false;
          if (t.budgetCategoryId === cat.id) return true;
          if (!t.budgetCategoryId && t.category?.toLowerCase() === cat.name.toLowerCase()) return true;
          return false;
        })
        .reduce((s, t) => s + Number(t.amount.toString()), 0);
    });

    return {
      id: cat.id,
      name: cat.name,
      amount: Number(cat.amount.toString()),
      actual: matched.reduce((s, t) => s + Number(t.amount.toString()), 0),
      monthlySpend,
    };
  });

  const txnRows = transactions
    .filter((t) => Number(t.amount.toString()) > 0) // expenses only
    .map((t) => {
      const n = Number(t.amount.toString());
      // Resolve effective budget category
      let effectiveBudgetCategoryId = t.budgetCategoryId ?? null;
      if (!effectiveBudgetCategoryId && t.category) {
        const autoId = catNameToId.get(t.category.toLowerCase());
        if (autoId) effectiveBudgetCategoryId = autoId;
      }
      return {
        id: t.id,
        date: format(t.date, "MMM d"),
        rawDate: format(t.date, "yyyy-MM-dd"),
        name: t.merchantName ?? t.name,
        amount: n,
        category: t.category ?? null,
        accountName: `${t.finAccount.name} ••${t.finAccount.mask ?? "?"}`,
        budgetCategoryId: effectiveBudgetCategoryId,
        explicit: !!t.budgetCategoryId,
      };
    });

  return (
    <>
      <AppNav email={session?.user?.email} />
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Budget & Planning</h1>
          <p className="text-sm text-stone-500">{format(month, "MMMM yyyy")}</p>
        </div>
        <BudgetEditor
          budgetId={budget.id}
          month={format(month, "yyyy-MM-dd")}
          initialCategories={categories}
          initialTransactions={txnRows}
        />
      </main>
    </>
  );
}
