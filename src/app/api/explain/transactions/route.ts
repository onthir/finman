import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  aggregate,
  buildWhere,
  getPeriod,
  type TxnSearchParams,
} from "@/lib/transactions";
import { format } from "date-fns";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  const sp = (await req.json()) as TxnSearchParams;
  const period = getPeriod(sp);

  const currWhere = buildWhere(sp, session.user.id, period.start, period.end);
  const prevWhere =
    period.prevStart && period.prevEnd
      ? buildWhere(sp, session.user.id, period.prevStart, period.prevEnd)
      : null;

  const [currRows, prevRows] = await Promise.all([
    db.transaction.findMany({
      where: currWhere,
      select: {
        amount: true,
        category: true,
        merchantName: true,
        name: true,
      },
    }),
    prevWhere
      ? db.transaction.findMany({
          where: prevWhere,
          select: {
            amount: true,
            category: true,
            merchantName: true,
            name: true,
          },
        })
      : Promise.resolve([]),
  ]);

  if (currRows.length === 0) {
    return NextResponse.json({
      explanation:
        "No transactions in this period yet — nothing to explain.",
    });
  }

  const curr = aggregate(currRows);
  const prev = aggregate(prevRows);

  const topCats = [...curr.byCat.entries()]
    .map(([cat, total]) => ({
      cat,
      total,
      prev: prev.byCat.get(cat) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const topMerchants = [...curr.byMerchant.entries()]
    .map(([m, v]) => ({
      merchant: m,
      total: v.total,
      count: v.count,
      prev: prev.byMerchant.get(m)?.total ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const filterSummary = [
    sp.q ? `merchant matches "${sp.q}"` : null,
    sp.category ? `category = ${sp.category}` : null,
    sp.account ? `single account` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const prompt = `You are a personal-finance assistant. Explain the user's spending for this period in plain, friendly language. Be specific and conversational, like a friend reading their statement. Do NOT give advice or lecture. Just describe what happened and what stood out.

Write 3–5 short sentences. No headings, no bullets, no preamble. Round dollars to whole numbers in prose. Mention specific category and merchant names when relevant. If something is notably different from the previous period, call it out and quantify it. If the previous period is missing, just describe this period.

Period: ${period.label} (${format(period.start, "MMM d")} → ${format(period.end, "MMM d")})
${prevWhere ? `Comparing to previous: ${format(period.prevStart!, "MMM d")} → ${format(period.prevEnd!, "MMM d")}` : "No previous period to compare."}
${filterSummary ? `Active filters: ${filterSummary}` : ""}

This period:
- Total spent: $${curr.out.toFixed(2)} across ${currRows.length} transactions
- Total income: $${curr.in.toFixed(2)}
- Net: $${(curr.in - curr.out).toFixed(2)}

${
  prevWhere
    ? `Previous period:
- Total spent: $${prev.out.toFixed(2)}
- Total income: $${prev.in.toFixed(2)}
- Net: $${(prev.in - prev.out).toFixed(2)}`
    : ""
}

Top spending categories (this vs previous):
${topCats
  .map(
    (c) =>
      `- ${c.cat}: $${c.total.toFixed(0)}${
        prevWhere ? ` (was $${c.prev.toFixed(0)})` : ""
      }`,
  )
  .join("\n")}

Top merchants (this period):
${topMerchants
  .map(
    (m) =>
      `- ${m.merchant}: $${m.total.toFixed(0)} (${m.count} txn${m.count === 1 ? "" : "s"})${
        prevWhere && m.prev > 0 ? `, was $${m.prev.toFixed(0)}` : ""
      }`,
  )
  .join("\n")}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return NextResponse.json({ explanation: text });
}
