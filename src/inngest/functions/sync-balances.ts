import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { plaid } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";

export const syncBalances = inngest.createFunction(
  {
    id: "plaid-sync-balances",
    concurrency: { key: "event.data.plaidItemDbId", limit: 1 },
    retries: 3,
  },
  { event: "plaid/sync.balances" },
  async ({ event, step }) => {
    const { plaidItemDbId } = event.data;

    const item = await step.run("load-item", () =>
      db.plaidItem.findUniqueOrThrow({
        where: { id: plaidItemDbId },
        select: { id: true, userId: true, accessTokenCipher: true },
      }),
    );

    const accessToken = decrypt(item.accessTokenCipher);

    const accounts = await step.run("fetch-accounts", async () => {
      const res = await plaid.accountsGet({ access_token: accessToken });
      return res.data.accounts;
    });

    await step.run("upsert-accounts", async () => {
      for (const a of accounts) {
        await db.finAccount.upsert({
          where: { plaidAccountId: a.account_id },
          create: {
            userId: item.userId,
            plaidItemId: item.id,
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
          update: {
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
    });

    return { accounts: accounts.length };
  },
);
