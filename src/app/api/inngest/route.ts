import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import {
  syncTransactions,
  syncBalances,
  syncLiabilities,
  syncHoldings,
  categorizeBatch,
  checkBillsDue,
  generateWeeklyInsights,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncTransactions,
    syncBalances,
    syncLiabilities,
    syncHoldings,
    categorizeBatch,
    checkBillsDue,
    generateWeeklyInsights,
  ],
});
