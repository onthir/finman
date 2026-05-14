import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/categories";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const categorizeBatch = inngest.createFunction(
  {
    id: "txn-categorize-batch",
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 2,
  },
  { event: "txn/categorize.batch" },
  async ({ event, step }) => {
    const { transactionIds } = event.data;
    if (!transactionIds.length) return { categorized: 0 };
    if (!process.env.ANTHROPIC_API_KEY) {
      return { categorized: 0, skipped: "no ANTHROPIC_API_KEY" };
    }

    const txns = await step.run("load-txns", () =>
      db.transaction.findMany({
        where: { id: { in: transactionIds } },
        select: {
          id: true,
          name: true,
          merchantName: true,
          amount: true,
          pfcPrimary: true,
          pfcDetailed: true,
        },
      }),
    );
    if (!txns.length) return { categorized: 0 };

    const list = txns.map((t, i) => ({
      i,
      merchant: t.merchantName ?? t.name,
      raw: t.name,
      amount: Number(t.amount.toString()),
      plaidHint: t.pfcDetailed ?? t.pfcPrimary ?? null,
    }));

    const prompt = `You are categorizing personal-finance transactions. For each transaction below, pick the single best category from this list:\n\n${CATEGORIES.map((c) => `- ${c}`).join("\n")}\n\nRespond ONLY with a JSON array of objects: [{"i": <index>, "category": "<category>"}]. Use exactly the category strings from the list. If unclear, use "Other".\n\nTransactions:\n${JSON.stringify(list, null, 2)}`;

    const result = await step.run("call-claude", async () => {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const m = text.match(/\[[\s\S]*\]/);
      if (!m) throw new Error("Claude did not return JSON array");
      return JSON.parse(m[0]) as { i: number; category: string }[];
    });

    const validCats = new Set<string>(CATEGORIES);
    const updates = result.filter((r) => validCats.has(r.category) && txns[r.i]);

    await step.run("apply-updates", async () => {
      for (const r of updates) {
        await db.transaction.update({
          where: { id: txns[r.i].id },
          data: { category: r.category, categorySource: "ai" },
        });
      }
    });

    return { categorized: updates.length };
  },
);
