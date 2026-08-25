import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  budgetId: z.string(),
  name: z.string().min(1).max(100),
  amount: z.number().min(0),
});

// POST /api/budget/categories — add a category to a budget
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { budgetId, name, amount } = body.data;

  // Verify budget belongs to user
  const budget = await db.budget.findFirst({ where: { id: budgetId, userId } });
  if (!budget) return NextResponse.json({ error: "not found" }, { status: 404 });

  const category = await db.budgetCategory.create({
    data: { budgetId, name, amount },
  });

  return NextResponse.json(category, { status: 201 });
}
