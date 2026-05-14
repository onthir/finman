import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { ResyncButton } from "@/components/resync-button";
import { MonthlyBars, CategoryPie } from "@/components/charts";
import {
  getAccountsWithItems,
  getRecentTransactions,
  getMonthlySpendByCategory,
  getCategorySplit,
  getNetWorth,
  getUpcomingPayments,
  getLatestInsight,
} from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { format } from "date-fns";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [items, recent, monthly, split, net, upcoming, insight] =
    await Promise.all([
      getAccountsWithItems(userId),
      getRecentTransactions(userId, 10),
      getMonthlySpendByCategory(userId, 6),
      getCategorySplit(userId, 30),
      getNetWorth(userId),
      getUpcomingPayments(userId, 14),
      getLatestInsight(userId),
    ]);

  const monthlyCats = Array.from(
    new Set(monthly.flatMap((m) => Object.keys(m).filter((k) => k !== "month"))),
  );

  const noAccounts = items.length === 0;

  return (
    <>
      <AppNav email={session?.user?.email} />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Hero */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider font-medium text-stone-500">
                Net worth
              </div>
              <div className="mt-1 text-4xl font-bold tracking-tight text-stone-900 tabular">
                {formatMoney(net.net)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <SubStat
                label="Assets"
                value={net.assets}
                tone="positive"
                icon={<ArrowUpRight className="h-3.5 w-3.5" />}
              />
              <SubStat
                label="Liabilities"
                value={net.liabilities}
                tone="negative"
                icon={<ArrowDownRight className="h-3.5 w-3.5" />}
              />
              <div className="flex items-center gap-2">
                <ResyncButton />
                <PlaidLinkButton />
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming payments */}
        {upcoming.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertCircle className="h-4 w-4" />
              Upcoming payments
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {upcoming.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 ring-1 ring-amber-200/60"
                >
                  <div>
                    <div className="font-medium text-stone-900">
                      {l.finAccount.name}
                      <span className="ml-1 text-stone-500 font-normal">
                        ••{l.finAccount.mask ?? "?"}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500">
                      Due{" "}
                      {l.nextPaymentDueDate
                        ? format(l.nextPaymentDueDate, "EEE, MMM d")
                        : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-stone-900 tabular">
                      {formatMoney(l.minimumPaymentAmount)}
                    </div>
                    <div className="text-xs text-stone-500 tabular">
                      stmt {formatMoney(l.lastStatementBalance)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {noAccounts ? (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <div className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-stone-900">
              Connect your first account
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              We'll pull your transactions and balances in the background.
            </p>
            <div className="mt-5 flex justify-center">
              <PlaidLinkButton />
            </div>
          </section>
        ) : (
          <>
            {/* Charts */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel
                title="Monthly spend by category"
                subtitle="Last 6 months"
              >
                {monthly.length ? (
                  <MonthlyBars data={monthly} categories={monthlyCats} />
                ) : (
                  <EmptyChart />
                )}
              </Panel>
              <Panel title="Where it went" subtitle="Last 30 days">
                {split.length ? <CategoryPie data={split} /> : <EmptyChart />}
              </Panel>
            </section>

            {/* Recent + Insight */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Panel
                title="Recent transactions"
                subtitle="Latest activity"
                className="lg:col-span-2"
                padded={false}
              >
                <ul className="divide-y divide-stone-100">
                  {recent.map((t) => {
                    const n = Number(t.amount.toString());
                    const isIncome = n < 0;
                    return (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-stone-50/60"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryDot category={t.category ?? "Other"} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-stone-900">
                              {t.merchantName ?? t.name}
                            </div>
                            <div className="text-xs text-stone-500">
                              {format(t.date, "MMM d")} ·{" "}
                              {t.finAccount.name} ••{t.finAccount.mask ?? "?"}{" "}
                              · {t.category ?? "Uncategorized"}
                              {t.pending && (
                                <span className="ml-2 rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">
                                  pending
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`text-sm font-semibold tabular ${
                            isIncome ? "text-emerald-600" : "text-stone-900"
                          }`}
                        >
                          {isIncome
                            ? `+${formatMoney(-n)}`
                            : `−${formatMoney(n)}`}
                        </div>
                      </li>
                    );
                  })}
                  {recent.length === 0 && (
                    <li className="px-5 py-10 text-center text-sm text-stone-500">
                      Transactions will appear after the first sync.
                    </li>
                  )}
                </ul>
              </Panel>
              <Panel title="Latest insight" subtitle="AI summary">
                {insight ? (
                  <>
                    <div className="text-sm font-medium text-stone-900">
                      {insight.title}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-stone-600 leading-relaxed">
                      {insight.body}
                    </pre>
                    <div className="mt-4 text-xs text-stone-400">
                      {format(insight.createdAt, "MMM d, yyyy")}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-stone-500">
                    Insights generate weekly once you have transaction history.
                  </p>
                )}
              </Panel>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function SubStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
  icon: React.ReactNode;
}) {
  const color = tone === "positive" ? "text-emerald-600" : "text-rose-600";
  const bg = tone === "positive" ? "bg-emerald-50" : "bg-rose-50";
  return (
    <div className="flex items-center gap-3">
      <div className={`inline-grid h-9 w-9 place-items-center rounded-xl ${bg} ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">
          {label}
        </div>
        <div className="text-base font-semibold text-stone-900 tabular">
          {formatMoney(value)}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className,
  padded = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className ?? ""}`}
    >
      <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-stone-900 tracking-tight">
          {title}
        </h3>
        {subtitle && (
          <span className="text-xs text-stone-400">{subtitle}</span>
        )}
      </div>
      <div className={padded ? "px-5 pb-5" : "pb-2"}>{children}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-stone-400">
      Not enough data yet.
    </div>
  );
}

const CAT_COLORS: Record<string, string> = {
  "Food & Drink": "bg-rose-500",
  Groceries: "bg-emerald-500",
  Transportation: "bg-sky-500",
  Travel: "bg-cyan-500",
  "Rent & Housing": "bg-violet-500",
  Utilities: "bg-amber-500",
  Entertainment: "bg-pink-500",
  Shopping: "bg-orange-500",
  "Personal Care": "bg-fuchsia-500",
  Health: "bg-red-500",
  Education: "bg-indigo-500",
  Subscriptions: "bg-purple-500",
  "Fees & Charges": "bg-stone-500",
  Taxes: "bg-zinc-700",
  Insurance: "bg-blue-500",
  "Gifts & Donations": "bg-teal-500",
  Income: "bg-emerald-600",
  Transfer: "bg-stone-400",
  Investment: "bg-lime-500",
  "Loan Payment": "bg-amber-700",
  Other: "bg-stone-300",
};

function CategoryDot({ category }: { category: string }) {
  const c = CAT_COLORS[category] ?? "bg-stone-300";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c}`} />;
}
