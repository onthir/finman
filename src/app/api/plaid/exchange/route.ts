import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { plaid, PLAID_COUNTRY_CODES } from "@/lib/plaid";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { inngest } from "@/lib/inngest";

const schema = z.object({
  public_token: z.string().min(1),
  institution: z
    .object({ institution_id: z.string(), name: z.string() })
    .optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.parse(await req.json());

  const exch = await plaid.itemPublicTokenExchange({
    public_token: body.public_token,
  });
  const accessToken = exch.data.access_token;
  const plaidItemId = exch.data.item_id;

  let institutionId = body.institution?.institution_id ?? "unknown";
  let institutionName = body.institution?.name ?? "Unknown";
  if (!body.institution) {
    const itemRes = await plaid.itemGet({ access_token: accessToken });
    if (itemRes.data.item.institution_id) {
      institutionId = itemRes.data.item.institution_id;
      const inst = await plaid.institutionsGetById({
        institution_id: institutionId,
        country_codes: PLAID_COUNTRY_CODES,
      });
      institutionName = inst.data.institution.name;
    }
  }

  const itemRow = await db.plaidItem.create({
    data: {
      userId: session.user.id,
      plaidItemId,
      institutionId,
      institutionName,
      accessTokenCipher: encrypt(accessToken),
    },
  });

  // Fetch accounts before first transaction sync (sync uses account_id refs).
  const acctsRes = await plaid.accountsGet({ access_token: accessToken });
  for (const a of acctsRes.data.accounts) {
    await db.finAccount.create({
      data: {
        userId: session.user.id,
        plaidItemId: itemRow.id,
        plaidAccountId: a.account_id,
        name: a.name,
        officialName: a.official_name ?? null,
        mask: a.mask ?? null,
        type: a.type,
        subtype: a.subtype ?? null,
        currentBalance: a.balances.current ?? null,
        availableBalance: a.balances.available ?? null,
        isoCurrencyCode: a.balances.iso_currency_code ?? "USD",
      },
    });
  }

  // Kick off background sync.
  await inngest.send([
    {
      name: "plaid/sync.transactions",
      data: { plaidItemDbId: itemRow.id },
    },
    {
      name: "plaid/sync.liabilities",
      data: { plaidItemDbId: itemRow.id },
    },
    {
      name: "plaid/sync.holdings",
      data: { plaidItemDbId: itemRow.id },
    },
  ]);

  return NextResponse.json({
    item: { id: itemRow.id, institutionName },
    accounts: acctsRes.data.accounts.length,
  });
}
