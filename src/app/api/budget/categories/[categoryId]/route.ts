import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().min(0).optional(),
});

async function getCategory(categoryId: string, userId: string) {
  return db.budgetCategory.findFirst({
    where: { id: categoryId, budget: { userId } },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { categoryId } = await params;

  const existing = await getCategory(categoryId, session.user.id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const updated = await db.budgetCategory.update({
    where: { id: categoryId },
    data: body.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { categoryId } = await params;

  const existing = await getCategory(categoryId, session.user.id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.budgetCategory.delete({ where: { id: categoryId } });
  return new Response(null, { status: 204 });
}
