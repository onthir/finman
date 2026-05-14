"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { revalidatePath } from "next/cache";

export async function resyncAll() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");

  const items = await db.plaidItem.findMany({
    where: { userId: session.user.id, status: "active" },
    select: { id: true },
  });
  if (!items.length) return { queued: 0 };

  const events = items.flatMap((it) => [
    {
      name: "plaid/sync.transactions" as const,
      data: { plaidItemDbId: it.id },
    },
    {
      name: "plaid/sync.balances" as const,
      data: { plaidItemDbId: it.id },
    },
    {
      name: "plaid/sync.liabilities" as const,
      data: { plaidItemDbId: it.id },
    },
    {
      name: "plaid/sync.holdings" as const,
      data: { plaidItemDbId: it.id },
    },
  ]);

  await inngest.send(events);
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  return { queued: items.length };
}
