import type { Prisma } from "@prisma/client";
import {
  endOfDay,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
  differenceInCalendarDays,
} from "date-fns";

export type TxnSearchParams = {
  period?: string;
  q?: string;
  category?: string;
  account?: string;
  from?: string;
  to?: string;
};

export type Period = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  prevStart: Date | null;
  prevEnd: Date | null;
  granularity: "day" | "month";
};

export function getPeriod(sp: TxnSearchParams): Period {
  const now = new Date();
  const p = sp.period || (sp.from || sp.to ? "custom" : "this-month");

  if (p === "custom") {
    const start = sp.from ? parseISO(sp.from) : startOfMonth(now);
    const end = sp.to ? endOfDay(parseISO(sp.to)) : now;
    const span = differenceInCalendarDays(end, start);
    return {
      key: "custom",
      label: `${format(start, "MMM d")} – ${format(end, "MMM d")}`,
      start,
      end,
      prevStart: null,
      prevEnd: null,
      granularity: span <= 62 ? "day" : "month",
    };
  }
  if (p === "last-month") {
    const start = startOfMonth(subMonths(now, 1));
    const end = endOfMonth(start);
    const prevStart = startOfMonth(subMonths(start, 1));
    const prevEnd = endOfMonth(prevStart);
    return {
      key: "last-month",
      label: format(start, "MMMM yyyy"),
      start,
      end,
      prevStart,
      prevEnd,
      granularity: "day",
    };
  }
  if (p === "3m") {
    const start = startOfMonth(subMonths(now, 2));
    const end = now;
    const prevEnd = subDays(start, 1);
    const prevStart = startOfMonth(subMonths(prevEnd, 2));
    return {
      key: "3m",
      label: "Last 3 months",
      start,
      end,
      prevStart,
      prevEnd,
      granularity: "month",
    };
  }
  if (p === "ytd") {
    const start = startOfYear(now);
    const end = now;
    const prevStart = startOfYear(subYears(now, 1));
    const prevEnd = subYears(now, 1);
    return {
      key: "ytd",
      label: `${format(now, "yyyy")} so far`,
      start,
      end,
      prevStart,
      prevEnd,
      granularity: "month",
    };
  }
  if (p === "all") {
    return {
      key: "all",
      label: "All time",
      start: new Date(0),
      end: now,
      prevStart: null,
      prevEnd: null,
      granularity: "month",
    };
  }
  const start = startOfMonth(now);
  const end = now;
  const prevStart = startOfMonth(subMonths(now, 1));
  const prevEnd = endOfMonth(prevStart);
  return {
    key: "this-month",
    label: format(now, "MMMM"),
    start,
    end,
    prevStart,
    prevEnd,
    granularity: "day",
  };
}

export function buildWhere(
  sp: TxnSearchParams,
  userId: string,
  start: Date,
  end: Date,
): Prisma.TransactionWhereInput {
  return {
    userId,
    date: { gte: start, lte: end },
    ...(sp.category ? { category: sp.category } : {}),
    ...(sp.account ? { finAccountId: sp.account } : {}),
    ...(sp.q
      ? {
          OR: [
            { name: { contains: sp.q, mode: "insensitive" } },
            { merchantName: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function aggregate(
  rows: {
    amount: Prisma.Decimal;
    category: string | null;
    merchantName?: string | null;
    name?: string;
  }[],
) {
  let out = 0;
  let inn = 0;
  const byCat = new Map<string, number>();
  const byMerchant = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const n = Number(r.amount.toString());
    if (n >= 0) {
      out += n;
      const cat = r.category ?? "Other";
      byCat.set(cat, (byCat.get(cat) ?? 0) + n);
      const merch = r.merchantName ?? r.name ?? "Unknown";
      const cur = byMerchant.get(merch) ?? { total: 0, count: 0 };
      cur.total += n;
      cur.count += 1;
      byMerchant.set(merch, cur);
    } else {
      inn += -n;
    }
  }
  return { out, in: inn, byCat, byMerchant };
}

export function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
