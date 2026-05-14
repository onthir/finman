import { EventSchemas, Inngest } from "inngest";

type Events = {
  "plaid/item.created": { data: { plaidItemDbId: string; userId: string } };
  "plaid/sync.transactions": { data: { plaidItemDbId: string } };
  "plaid/sync.balances": { data: { plaidItemDbId: string } };
  "plaid/sync.liabilities": { data: { plaidItemDbId: string } };
  "plaid/sync.holdings": { data: { plaidItemDbId: string } };
  "plaid/item.error": {
    data: { plaidItemDbId: string; errorCode: string; errorMessage: string };
  };
  "txn/categorize.batch": { data: { userId: string; transactionIds: string[] } };
  "insights/generate.weekly": { data: { userId: string } };
  "bills/check.due": { data: { userId?: string } };
};

export const inngest = new Inngest({
  id: "finman",
  isDev: process.env.NODE_ENV !== "production",
  schemas: new EventSchemas().fromRecord<Events>(),
});
