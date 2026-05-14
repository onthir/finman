import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { subDays, startOfDay } from "date-fns";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const generateWeeklyInsights = inngest.createFunction(
  { id: "insights-weekly", retries: 1 },
  [{ event: "insights/generate.weekly" }, { cron: "TZ=America/New_York 0 9 * * 1" }],
  async ({ event, step }) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { skipped: "no ANTHROPIC_API_KEY" };
    }

    const explicitUserId =
      event.data && "userId" in event.data ? event.data.userId : undefined;
    const userIds = explicitUserId
      ? [explicitUserId]
      : (await db.user.findMany({ select: { id: true } })).map((u) => u.id);

    let generated = 0;
    for (const userId of userIds) {
      const end = startOfDay(new Date());
      const start = subDays(end, 30);
      const prevStart = subDays(start, 30);

      const [thisPeriod, prevPeriod] = await Promise.all([
        step.run(`agg-this-${userId}`, () =>
          db.transaction.groupBy({
            by: ["category"],
            where: {
              userId,
              date: { gte: start, lt: end },
              amount: { gt: 0 },
            },
            _sum: { amount: true },
            _count: true,
          }),
        ),
        step.run(`agg-prev-${userId}`, () =>
          db.transaction.groupBy({
            by: ["category"],
            where: {
              userId,
              date: { gte: prevStart, lt: start },
              amount: { gt: 0 },
            },
            _sum: { amount: true },
          }),
        ),
      ]);

      if (!thisPeriod.length) continue;

      const prevMap = new Map(
        prevPeriod.map((p) => [p.category, Number(p._sum.amount ?? 0)]),
      );
      const compact = thisPeriod
        .map((t) => ({
          category: t.category ?? "Other",
          this: Number(t._sum.amount ?? 0),
          prev: prevMap.get(t.category) ?? 0,
          count: t._count,
        }))
        .sort((a, b) => b.this - a.this);

      const prompt = `You write concise, helpful financial insights. Given this user's spending by category for the last 30 days vs the previous 30 days, produce exactly 3 short bullets (one sentence each) highlighting notable trends, surprises, or wins. No advice, no hedging, no preamble. Output a JSON object: {"title": "...", "bullets": ["...", "...", "..."]}.\n\nData (amounts in USD; positive = money out):\n${JSON.stringify(compact)}`;

      const result = await step.run(`claude-${userId}`, async () => {
        const msg = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        });
        const text = msg.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("no JSON object in Claude response");
        return JSON.parse(m[0]) as { title: string; bullets: string[] };
      });

      await step.run(`save-${userId}`, () =>
        db.insight.create({
          data: {
            userId,
            periodStart: start,
            periodEnd: end,
            kind: "weekly_summary",
            title: result.title,
            body: result.bullets.map((b) => `• ${b}`).join("\n"),
            data: { categories: compact },
          },
        }),
      );
      generated += 1;
    }

    return { generated };
  },
);
