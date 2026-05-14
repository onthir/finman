import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { plaid } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";

export const syncHoldings = inngest.createFunction(
  {
    id: "plaid-sync-holdings",
    concurrency: { key: "event.data.plaidItemDbId", limit: 1 },
    retries: 3,
  },
  { event: "plaid/sync.holdings" },
  async ({ event, step }) => {
    const { plaidItemDbId } = event.data;

    const item = await step.run("load-item", () =>
      db.plaidItem.findUniqueOrThrow({
        where: { id: plaidItemDbId },
        select: { id: true, userId: true, accessTokenCipher: true },
      }),
    );

    const accessToken = decrypt(item.accessTokenCipher);

    const data = await step.run("fetch-holdings", async () => {
      try {
        const res = await plaid.investmentsHoldingsGet({
          access_token: accessToken,
        });
        return res.data;
      } catch (e: unknown) {
        const code = (e as { response?: { data?: { error_code?: string } } })
          ?.response?.data?.error_code;
        if (code === "PRODUCTS_NOT_SUPPORTED") return null;
        throw e;
      }
    });

    if (!data) return { holdings: 0 };

    const securityById = new Map(data.securities.map((s) => [s.security_id, s]));

    await step.run("upsert-holdings", async () => {
      for (const h of data.holdings) {
        const fin = await db.finAccount.findUnique({
          where: { plaidAccountId: h.account_id },
          select: { id: true, userId: true },
        });
        if (!fin) continue;
        const sec = securityById.get(h.security_id);
        await db.holding.upsert({
          where: {
            finAccountId_plaidSecurityId: {
              finAccountId: fin.id,
              plaidSecurityId: h.security_id,
            },
          },
          create: {
            userId: fin.userId,
            finAccountId: fin.id,
            plaidSecurityId: h.security_id,
            tickerSymbol: sec?.ticker_symbol ?? null,
            name: sec?.name ?? null,
            quantity: h.quantity,
            costBasis: h.cost_basis ?? null,
            institutionPrice: h.institution_price ?? null,
            institutionValue: h.institution_value ?? null,
            isoCurrencyCode: h.iso_currency_code ?? "USD",
            asOf: h.institution_price_as_of
              ? new Date(h.institution_price_as_of)
              : null,
          },
          update: {
            tickerSymbol: sec?.ticker_symbol ?? null,
            name: sec?.name ?? null,
            quantity: h.quantity,
            costBasis: h.cost_basis ?? null,
            institutionPrice: h.institution_price ?? null,
            institutionValue: h.institution_value ?? null,
            isoCurrencyCode: h.iso_currency_code ?? "USD",
            asOf: h.institution_price_as_of
              ? new Date(h.institution_price_as_of)
              : null,
          },
        });
      }
    });

    return { holdings: data.holdings.length };
  },
);
