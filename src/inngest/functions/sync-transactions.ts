import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { plaid } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import { mapPlaidCategory, applyCategoryRules } from "@/lib/categories";
import type { Transaction as PlaidTxn, RemovedTransaction } from "plaid";

export const syncTransactions = inngest.createFunction(
  {
    id: "plaid-sync-transactions",
    concurrency: { key: "event.data.plaidItemDbId", limit: 1 },
    retries: 3,
  },
  { event: "plaid/sync.transactions" },
  async ({ event, step }) => {
    const { plaidItemDbId } = event.data;

    const item = await step.run("load-item", async () => {
      const row = await db.plaidItem.findUnique({
        where: { id: plaidItemDbId },
        select: {
          id: true,
          userId: true,
          accessTokenCipher: true,
          cursor: true,
        },
      });
      if (!row) throw new Error(`PlaidItem ${plaidItemDbId} not found`);
      return row;
    });

    const accessToken = decrypt(item.accessTokenCipher);
    let cursor = item.cursor ?? undefined;
    let hasMore = true;
    let pages = 0;
    const added: PlaidTxn[] = [];
    const modified: PlaidTxn[] = [];
    const removed: RemovedTransaction[] = [];

    while (hasMore && pages < 25) {
      const page = await step.run(`fetch-page-${pages}`, async () => {
        const res = await plaid.transactionsSync({
          access_token: accessToken,
          cursor,
          count: 500,
        });
        return res.data;
      });
      added.push(...page.added);
      modified.push(...page.modified);
      removed.push(...page.removed);
      cursor = page.next_cursor;
      hasMore = page.has_more;
      pages += 1;
    }

    // Load category rules once.
    const rules = await step.run("load-rules", () =>
      db.categoryRule.findMany({
        where: { userId: item.userId },
        select: { matchPattern: true, category: true },
      }),
    );

    // Build a map: plaidAccountId → finAccountId
    const finAccounts = await step.run("load-accounts", () =>
      db.finAccount.findMany({
        where: { plaidItemId: item.id },
        select: { id: true, plaidAccountId: true },
      }),
    );
    const accountIdMap = new Map(
      finAccounts.map((a) => [a.plaidAccountId, a.id]),
    );

    const upserted = await step.run("apply-changes", async () => {
      const newTxnIds: string[] = [];

      for (const t of [...added, ...modified]) {
        const finAccountId = accountIdMap.get(t.account_id);
        if (!finAccountId) continue; // account not yet known; will catch on next /accounts/get

        const pfcPrimary = t.personal_finance_category?.primary ?? null;
        const pfcDetailed = t.personal_finance_category?.detailed ?? null;
        const ruleHit = applyCategoryRules(rules, t.merchant_name ?? null, t.name);
        const category = ruleHit ?? mapPlaidCategory(pfcPrimary, pfcDetailed);
        const categorySource = ruleHit ? "rule" : "plaid";

        const row = await db.transaction.upsert({
          where: { plaidTransactionId: t.transaction_id },
          create: {
            userId: item.userId,
            finAccountId,
            plaidTransactionId: t.transaction_id,
            amount: t.amount,
            isoCurrencyCode: t.iso_currency_code ?? "USD",
            date: new Date(t.date),
            authorizedDate: t.authorized_date ? new Date(t.authorized_date) : null,
            name: t.name,
            merchantName: t.merchant_name ?? null,
            pending: t.pending,
            paymentChannel: t.payment_channel ?? null,
            pfcPrimary,
            pfcDetailed,
            pfcConfidence: t.personal_finance_category?.confidence_level ?? null,
            category,
            categorySource,
          },
          update: {
            amount: t.amount,
            date: new Date(t.date),
            authorizedDate: t.authorized_date ? new Date(t.authorized_date) : null,
            name: t.name,
            merchantName: t.merchant_name ?? null,
            pending: t.pending,
            paymentChannel: t.payment_channel ?? null,
            pfcPrimary,
            pfcDetailed,
            pfcConfidence: t.personal_finance_category?.confidence_level ?? null,
          },
        });
        if (categorySource === "plaid" && category === "Other") {
          newTxnIds.push(row.id);
        }
      }

      if (removed.length) {
        await db.transaction.deleteMany({
          where: {
            plaidTransactionId: { in: removed.map((r) => r.transaction_id) },
          },
        });
      }

      return { added: added.length, modified: modified.length, removed: removed.length, uncategorized: newTxnIds };
    });

    await step.run("update-cursor", () =>
      db.plaidItem.update({
        where: { id: item.id },
        data: { cursor, lastSyncedAt: new Date(), status: "active", errorCode: null, errorMessage: null },
      }),
    );

    // Fire categorization job for uncategorized rows.
    if (upserted.uncategorized.length) {
      await step.sendEvent("enqueue-categorize", {
        name: "txn/categorize.batch",
        data: { userId: item.userId, transactionIds: upserted.uncategorized },
      });
    }

    return upserted;
  },
);
