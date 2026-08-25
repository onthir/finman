import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfMonth, parseISO } from "date-fns";

// GET /api/budget?month=2026-08-01 — get or create budget for a month
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const month = monthParam ? startOfMonth(parseISO(monthParam)) : startOfMonth(new Date());

  const budget = await db.budget.upsert({
    where: { userId_month: { userId, month } },
    create: { userId, month },
    update: {},
    include: { categories: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json(budget);
}
