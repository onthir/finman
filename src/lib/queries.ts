import { db } from "@/lib/db";
import { subDays, startOfMonth, subMonths, format } from "date-fns";

export async function getAccountsWithItems(userId: string) {
  return db.plaidItem.findMany({
    where: { userId },
    include: {
      finAccounts: {
        where: { hidden: false },
        orderBy: { type: "asc" },
        include: { liability: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getRecentTransactions(userId: string, limit = 25) {
  return db.transaction.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: limit,
    include: { finAccount: { select: { name: true, mask: true } } },
  });
}

export async function getMonthlySpendByCategory(userId: string, months = 6) {
  const start = startOfMonth(subMonths(new Date(), months - 1));
  const rows = await db.transaction.findMany({
    where: {
      userId,
      date: { gte: start },
      amount: { gt: 0 },
      category: { not: "Transfer" },
    },
    select: { date: true, amount: true, category: true },
  });

  // Group by month-string + category.
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const k = format(r.date, "yyyy-MM");
    const cat = r.category ?? "Other";
    const row = map.get(k) ?? {};
    row[cat] = (row[cat] ?? 0) + Number(r.amount.toString());
    map.set(k, row);
  }
  return [...map.entries()]
    .map(([month, cats]) => ({ month, ...cats }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function getCategorySplit(userId: string, days = 30) {
  const start = subDays(new Date(), days);
  const rows = await db.transaction.groupBy({
    by: ["category"],
    where: {
      userId,
      date: { gte: start },
      amount: { gt: 0 },
      category: { not: "Transfer" },
    },
    _sum: { amount: true },
  });
  return rows
    .map((r) => ({
      category: r.category ?? "Other",
      total: Number(r._sum.amount?.toString() ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getNetWorth(userId: string) {
  const accounts = await db.finAccount.findMany({
    where: { userId, hidden: false },
    select: { type: true, currentBalance: true },
  });
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    const v = Number(a.currentBalance?.toString() ?? 0);
    if (a.type === "credit" || a.type === "loan") liabilities += v;
    else assets += v;
  }
  return { assets, liabilities, net: assets - liabilities };
}

export async function getUpcomingPayments(userId: string, days = 14) {
  const end = new Date();
  end.setDate(end.getDate() + days);
  return db.liability.findMany({
    where: {
      userId,
      nextPaymentDueDate: { gte: new Date(), lte: end },
    },
    include: { finAccount: { select: { name: true, mask: true } } },
    orderBy: { nextPaymentDueDate: "asc" },
  });
}

export async function getLatestInsight(userId: string) {
  return db.insight.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
