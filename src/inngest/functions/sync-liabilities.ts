import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { plaid } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";

export const syncLiabilities = inngest.createFunction(
  {
    id: "plaid-sync-liabilities",
    concurrency: { key: "event.data.plaidItemDbId", limit: 1 },
    retries: 3,
  },
  { event: "plaid/sync.liabilities" },
  async ({ event, step }) => {
    const { plaidItemDbId } = event.data;

    const item = await step.run("load-item", () =>
      db.plaidItem.findUniqueOrThrow({
        where: { id: plaidItemDbId },
        select: { id: true, userId: true, accessTokenCipher: true },
      }),
    );

    const accessToken = decrypt(item.accessTokenCipher);

    const data = await step.run("fetch-liabilities", async () => {
      try {
        const res = await plaid.liabilitiesGet({ access_token: accessToken });
        return res.data;
      } catch (e: unknown) {
        // Item doesn't have liabilities product enabled (e.g., debit-only acct)
        const code = (e as { response?: { data?: { error_code?: string } } })
          ?.response?.data?.error_code;
        if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_LIABILITY_ACCOUNTS") {
          return null;
        }
        throw e;
      }
    });

    if (!data?.liabilities?.credit) return { credit: 0 };

    await step.run("upsert-credit-liabilities", async () => {
      for (const c of data.liabilities.credit ?? []) {
        if (!c.account_id) continue;
        const fin = await db.finAccount.findUnique({
          where: { plaidAccountId: c.account_id },
          select: { id: true, userId: true },
        });
        if (!fin) continue;
        await db.liability.upsert({
          where: { finAccountId: fin.id },
          create: {
            userId: fin.userId,
            finAccountId: fin.id,
            lastStatementBalance: c.last_statement_balance ?? null,
            lastStatementIssueDate: c.last_statement_issue_date
              ? new Date(c.last_statement_issue_date)
              : null,
            minimumPaymentAmount: c.minimum_payment_amount ?? null,
            nextPaymentDueDate: c.next_payment_due_date
              ? new Date(c.next_payment_due_date)
              : null,
            lastPaymentAmount: c.last_payment_amount ?? null,
            lastPaymentDate: c.last_payment_date
              ? new Date(c.last_payment_date)
              : null,
            aprPercent: c.aprs?.[0]?.apr_percentage ?? null,
            isOverdue: c.is_overdue ?? false,
          },
          update: {
            lastStatementBalance: c.last_statement_balance ?? null,
            lastStatementIssueDate: c.last_statement_issue_date
              ? new Date(c.last_statement_issue_date)
              : null,
            minimumPaymentAmount: c.minimum_payment_amount ?? null,
            nextPaymentDueDate: c.next_payment_due_date
              ? new Date(c.next_payment_due_date)
              : null,
            lastPaymentAmount: c.last_payment_amount ?? null,
            lastPaymentDate: c.last_payment_date
              ? new Date(c.last_payment_date)
              : null,
            aprPercent: c.aprs?.[0]?.apr_percentage ?? null,
            isOverdue: c.is_overdue ?? false,
          },
        });
      }
    });

    return { credit: data.liabilities.credit.length };
  },
);
