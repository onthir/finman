import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  budgetCategoryId: z.string().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ txnId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { txnId } = await params;

  const txn = await db.transaction.findFirst({ where: { id: txnId, userId } });
  if (!txn) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const updated = await db.transaction.update({
    where: { id: txnId },
    data: { budgetCategoryId: body.data.budgetCategoryId },
  });

  return NextResponse.json(updated);
}
