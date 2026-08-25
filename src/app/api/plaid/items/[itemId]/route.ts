import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plaid } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { itemId } = await params;

  const item = await db.plaidItem.findFirst({ where: { id: itemId, userId } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Tell Plaid to revoke access
  try {
    const accessToken = decrypt(item.accessTokenCipher);
    await plaid.itemRemove({ access_token: accessToken });
  } catch {
    // Continue even if Plaid call fails — remove locally regardless
  }

  // Cascade deletes finAccounts → transactions, holdings, liabilities
  await db.plaidItem.delete({ where: { id: itemId } });

  return new Response(null, { status: 204 });
}
