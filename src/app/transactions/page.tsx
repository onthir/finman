import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  format,
  startOfMonth,
  startOfYear,
  startOfDay,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
} from "date-fns";
import { Search, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import Link from "next/link";
import {
  aggregate,
  buildWhere,
  getPeriod,
  pctDelta,
  type TxnSearchParams,
} from "@/lib/transactions";
import { ExplainButton } from "@/components/explain-button";

export const dynamic = "force-dynamic";

type SP = TxnSearchParams;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  const userId = session!.user!.id!;
  const sp = await searchParams;
  const period = getPeriod(sp);

  const currWhere = buildWhere(sp, userId, period.start, period.end);
  const prevWhere =
    period.prevStart && period.prevEnd
      ? buildWhere(sp, userId, period.prevStart, period.prevEnd)
      : null;

  const [currRows, prevRows, accounts] = await Promise.all([
    db.transaction.findMany({
      where: currWhere,
      orderBy: { date: "desc" },
      include: { finAccount: { select: { name: true, mask: true } } },
    }),
    prevWhere
      ? db.transaction.findMany({
          where: prevWhere,
          select: { amount: true, category: true },
        })
      : Promise.resolve([]),
    db.finAccount.findMany({
      where: { userId, hidden: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, mask: true },
    }),
  ]);

  const curr = aggregate(currRows);
  const prev = aggregate(prevRows);
  const netCurr = curr.in - curr.out;
  const netPrev = prev.in - prev.out;

  // Trend buckets — switch to yearly when month count would exceed 36
  const interval = { start: period.start, end: period.end };
  const monthCount =
    period.granularity === "month"
      ? eachMonthOfInterval(interval).length
      : 0;
  const useYearly = monthCount > 36;

  const trendBuckets =
    period.granularity === "day"
      ? eachDayOfInterval(interval).map((d) => ({
          date: d,
          label: format(d, "d"),
          key: format(d, "yyyy-MM-dd"),
        }))
      : useYearly
        ? eachYearOfInterval(interval).map((d) => ({
            date: d,
            label: format(d, "yyyy"),
            key: format(d, "yyyy"),
          }))
        : eachMonthOfInterval(interval).map((d) => ({
            date: d,
            label: format(d, "MMM"),
            key: format(d, "yyyy-MM"),
          }));

  const bucketMap = new Map<string, number>();
  for (const t of currRows) {
    const n = Number(t.amount.toString());
    if (n < 0) continue;
    const k =
      period.granularity === "day"
        ? format(startOfDay(t.date), "yyyy-MM-dd")
        : useYearly
          ? format(startOfYear(t.date), "yyyy")
          : format(startOfMonth(t.date), "yyyy-MM");
    bucketMap.set(k, (bucketMap.get(k) ?? 0) + n);
  }
  const trend = trendBuckets.map((b) => ({
    ...b,
    out: bucketMap.get(b.key) ?? 0,
  }));
  const maxOut = Math.max(1, ...trend.map((t) => t.out));

  // Top categories with prev-period deltas
  const topCats = [...curr.byCat.entries()]
    .map(([cat, total]) => ({
      cat,
      total,
      prev: prev.byCat.get(cat) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const maxCat = Math.max(1, ...topCats.map((c) => c.total));

  const display = currRows.slice(0, 200);
  const hidden = currRows.length - display.length;

  return (
    <>
      <AppNav email={session?.user?.email} />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Transactions
          </h1>
          <p className="text-sm text-stone-500">
            {currRows.length.toLocaleString()} transaction
            {currRows.length === 1 ? "" : "s"} in {period.label.toLowerCase()}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          <PeriodChip current={period.key} target="this-month" sp={sp}>
            This month
          </PeriodChip>
          <PeriodChip current={period.key} target="last-month" sp={sp}>
            Last month
          </PeriodChip>
          <PeriodChip current={period.key} target="3m" sp={sp}>
            Last 3 months
          </PeriodChip>
          <PeriodChip current={period.key} target="ytd" sp={sp}>
            Year to date
          </PeriodChip>
          <PeriodChip current={period.key} target="all" sp={sp}>
            All time
          </PeriodChip>
        </div>

        {/* Hero */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-sm text-stone-500">
                You spent in {period.label.toLowerCase()}
              </div>
              <div className="mt-1 text-4xl font-bold tracking-tight text-stone-900 tabular">
                {formatMoney(curr.out)}
              </div>
              {prevWhere && <Delta curr={curr.out} prev={prev.out} unit="spend" />}
            </div>
            <div className="flex flex-wrap items-end gap-6">
              <MiniStat
                label="Income"
                value={curr.in}
                prev={prev.in}
                prevAvailable={!!prevWhere}
                unit="income"
              />
              <MiniStat
                label="Net"
                value={netCurr}
                prev={netPrev}
                prevAvailable={!!prevWhere}
                unit="net"
              />
              <ExplainButton params={sp} />
            </div>
          </div>
        </section>

        {/* Trend + Top categories */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel
            title={
              period.granularity === "day"
                ? "Day-by-day spend"
                : useYearly
                  ? "Year-by-year spend"
                  : "Month-by-month spend"
            }
            subtitle={period.label}
          >
            {trend.length === 0 ? (
              <Empty />
            ) : (
              <div className="flex items-end gap-1 h-40 mt-2">
                {trend.map((b) => {
                  const pct = (b.out / maxOut) * 100;
                  return (
                    <div
                      key={b.key}
                      className="flex-1 flex flex-col items-center gap-1 group"
                    >
                      <div className="relative w-full flex-1 flex items-end">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-indigo-400 to-violet-500 transition group-hover:from-indigo-500 group-hover:to-violet-600"
                          style={{
                            height: `${Math.max(pct, b.out > 0 ? 3 : 0)}%`,
                          }}
                          title={`${b.label}: ${formatMoney(b.out)}`}
                        />
                      </div>
                      <span className="text-[10px] text-stone-400 tabular">
                        {b.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Top categories" subtitle={period.label}>
            {topCats.length === 0 ? (
              <Empty />
            ) : (
              <ul className="mt-2 space-y-3">
                {topCats.map((c) => {
                  const pct = (c.total / maxCat) * 100;
                  const d = pctDelta(c.total, c.prev);
                  return (
                    <li key={c.cat}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-stone-700 font-medium">
                          {c.cat}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-stone-900 font-semibold tabular">
                            {formatMoney(c.total)}
                          </span>
                          {prevWhere && d !== null && (
                            <DeltaPill pct={d} unit="spend" small />
                          )}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>

        {/* Advanced filters */}
        <details
          className="rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] group"
          open={!!(sp.q || sp.category || sp.account || sp.from || sp.to)}
        >
          <summary className="px-5 py-3 text-sm font-medium text-stone-700 cursor-pointer select-none flex items-center justify-between">
            <span>
              Advanced filters
              {(sp.q || sp.category || sp.account || sp.from || sp.to) && (
                <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5">
                  active
                </span>
              )}
            </span>
            <span className="text-xs text-stone-400 group-open:rotate-180 transition">
              ▾
            </span>
          </summary>
          <form action="/transactions" className="px-5 pb-5">
            <input type="hidden" name="period" value={period.key} />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <Field label="Search merchant" className="md:col-span-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                  <input
                    name="q"
                    defaultValue={sp.q ?? ""}
                    placeholder="e.g. starbucks"
                    className="w-full rounded-lg border border-stone-200 bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-stone-400"
                  />
                </div>
              </Field>
              <Field label="Category" className="md:col-span-3">
                <select
                  name="category"
                  defaultValue={sp.category ?? ""}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
                >
                  <option value="">All</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Account" className="md:col-span-3">
                <select
                  name="account"
                  defaultValue={sp.account ?? ""}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
                >
                  <option value="">All</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ••{a.mask ?? "?"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Custom from" className="md:col-span-1">
                <input
                  type="date"
                  name="from"
                  defaultValue={sp.from ?? ""}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm outline-none focus:border-stone-400"
                />
              </Field>
              <Field label="Custom to" className="md:col-span-1">
                <input
                  type="date"
                  name="to"
                  defaultValue={sp.to ?? ""}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm outline-none focus:border-stone-400"
                />
              </Field>
              <button
                type="submit"
                className="md:col-span-1 rounded-lg bg-stone-900 text-white text-sm font-medium px-3 py-2 hover:bg-stone-800"
              >
                Apply
              </button>
            </div>
            <div className="mt-3 text-xs">
              <a
                href="/transactions"
                className="text-stone-500 hover:text-stone-700 underline"
              >
                Reset all filters
              </a>
              <span className="text-stone-400 ml-3">
                Custom dates override the period chips above.
              </span>
            </div>
          </form>
        </details>

        {/* Transactions list */}
        <div className="rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
          <div className="flex items-baseline justify-between px-5 pt-4 pb-2">
            <h3 className="text-sm font-semibold text-stone-900 tracking-tight">
              Transactions
            </h3>
            <span className="text-xs text-stone-400">
              Showing {display.length.toLocaleString()}
              {hidden > 0 ? ` of ${currRows.length.toLocaleString()}` : ""}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500 bg-stone-50/60">
              <tr className="border-y border-stone-200">
                <th className="text-left px-5 py-3 font-medium">Date</th>
                <th className="text-left px-5 py-3 font-medium">Merchant</th>
                <th className="text-left px-5 py-3 font-medium">Account</th>
                <th className="text-left px-5 py-3 font-medium">Category</th>
                <th className="text-right px-5 py-3 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {display.map((t) => {
                const n = Number(t.amount.toString());
                const isIncome = n < 0;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50"
                  >
                    <td className="px-5 py-3 text-stone-500 whitespace-nowrap">
                      {format(t.date, "MMM d, yyyy")}
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
              {display.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-stone-500"
                  >
                    No transactions in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hidden > 0 && (
            <div className="px-5 py-3 text-xs text-stone-500 border-t border-stone-100 bg-stone-50/60">
              {hidden.toLocaleString()} more rows hidden — narrow the period or
              add filters to see them.
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function PeriodChip({
  current,
  target,
  sp,
  children,
}: {
  current: string;
  target: string;
  sp: SP;
  children: React.ReactNode;
}) {
  const active = current === target;
  const qs = new URLSearchParams();
  qs.set("period", target);
  if (sp.q) qs.set("q", sp.q);
  if (sp.category) qs.set("category", sp.category);
  if (sp.account) qs.set("account", sp.account);
  return (
    <Link
      href={`/transactions?${qs.toString()}`}
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-stone-900 text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
          : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
      }`}
    >
      {children}
    </Link>
  );
}

/** unit: "spend" (lower = good), "income"/"net" (higher = good) */
function Delta({
  curr,
  prev,
  unit,
}: {
  curr: number;
  prev: number;
  unit: "spend" | "income" | "net";
}) {
  if (prev === 0 && curr === 0) {
    return (
      <div className="mt-1 text-sm text-stone-500">
        No spending in the previous period either.
      </div>
    );
  }
  if (prev === 0) {
    return (
      <div className="mt-1 text-sm text-stone-500">
        Nothing to compare to in the previous period.
      </div>
    );
  }
  const diff = curr - prev;
  const pct = (diff / Math.abs(prev)) * 100;
  const isLess = diff < 0;
  const good = unit === "spend" ? isLess : !isLess;
  const color = good ? "text-emerald-600" : "text-rose-600";
  const Icon = isLess ? ArrowDown : ArrowUp;
  const verb = unit === "spend" ? (isLess ? "less" : "more") : isLess ? "lower" : "higher";
  return (
    <div className={`mt-1 flex items-center gap-1.5 text-sm ${color}`}>
      <Icon className="h-4 w-4" />
      <span className="font-medium tabular">{formatMoney(Math.abs(diff))}</span>
      <span className="text-stone-500">{verb} than the previous period</span>
      <span className="text-stone-400 tabular">({Math.abs(pct).toFixed(0)}%)</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  prev,
  prevAvailable,
  unit,
}: {
  label: string;
  value: number;
  prev: number;
  prevAvailable: boolean;
  unit: "income" | "net" | "spend";
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-stone-500 font-medium">
        {label}
      </div>
      <div
        className={`text-xl font-bold tabular ${
          unit === "income" || (unit === "net" && value >= 0)
            ? "text-emerald-600"
            : value < 0
              ? "text-rose-600"
              : "text-stone-900"
        }`}
      >
        {value >= 0 && unit !== "spend" ? "+" : ""}
        {formatMoney(value)}
      </div>
      {prevAvailable && prev !== 0 && (
        <DeltaPill pct={((value - prev) / Math.abs(prev)) * 100} unit={unit} />
      )}
    </div>
  );
}

function DeltaPill({
  pct,
  unit,
  small,
}: {
  pct: number;
  unit: "spend" | "income" | "net";
  small?: boolean;
}) {
  const up = pct >= 0;
  const good = unit === "spend" ? !up : up;
  const Icon = up ? ArrowUp : pct < 0 ? ArrowDown : Minus;
  const color = good
    ? "bg-emerald-50 text-emerald-700"
    : "bg-rose-50 text-rose-700";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular ${color} ${
        small ? "text-[10px]" : "text-xs"
      }`}
    >
      <Icon className={small ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-stone-900 tracking-tight">
          {title}
        </h3>
        {subtitle && <span className="text-xs text-stone-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-stone-400">
      No data in this period.
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
        {label}
      </span>
      {children}
    </label>
  );
}
