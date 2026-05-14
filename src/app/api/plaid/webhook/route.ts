import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";

// NOTE: in production, verify the Plaid-Verification JWT header against the
// /webhook_verification_key/get endpoint. Skipped here for the foundation —
// implement before connecting any real accounts that have webhooks set.
// Docs: https://plaid.com/docs/api/webhooks/webhook-verification/

interface PlaidWebhookBody {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  error?: { error_code?: string; error_message?: string };
}

export async function POST(req: Request) {
  let body: PlaidWebhookBody;
  try {
    body = (await req.json()) as PlaidWebhookBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const item = await db.plaidItem.findUnique({
    where: { plaidItemId: body.item_id },
    select: { id: true, userId: true },
  });
  if (!item) {
    return NextResponse.json({ ok: true, note: "unknown item" });
  }

  await db.plaidItem.update({
    where: { id: item.id },
    data: { lastWebhookAt: new Date() },
  });

  const events: Parameters<typeof inngest.send>[0] = [];

  switch (body.webhook_type) {
    case "TRANSACTIONS":
      // SYNC_UPDATES_AVAILABLE, DEFAULT_UPDATE, INITIAL_UPDATE, HISTORICAL_UPDATE, etc.
      events.push({
        name: "plaid/sync.transactions",
        data: { plaidItemDbId: item.id },
      });
      break;
    case "LIABILITIES":
      events.push({
        name: "plaid/sync.liabilities",
        data: { plaidItemDbId: item.id },
      });
      break;
    case "HOLDINGS":
    case "INVESTMENTS_TRANSACTIONS":
      events.push({
        name: "plaid/sync.holdings",
        data: { plaidItemDbId: item.id },
      });
      break;
    case "ITEM":
      if (body.webhook_code === "ERROR" && body.error) {
        await db.plaidItem.update({
          where: { id: item.id },
          data: {
            status: "error",
            errorCode: body.error.error_code ?? null,
            errorMessage: body.error.error_message ?? null,
          },
        });
        events.push({
          name: "plaid/item.error",
          data: {
            plaidItemDbId: item.id,
            errorCode: body.error.error_code ?? "UNKNOWN",
            errorMessage: body.error.error_message ?? "",
          },
        });
      } else if (body.webhook_code === "USER_PERMISSION_REVOKED") {
        await db.plaidItem.update({
          where: { id: item.id },
          data: { status: "revoked" },
        });
      }
      break;
  }

  if (events.length) await inngest.send(events);
  return NextResponse.json({ ok: true });
}
