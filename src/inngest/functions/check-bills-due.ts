import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { Resend } from "resend";
import { formatMoney } from "@/lib/money";
import { addDays, format } from "date-fns";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const checkBillsDue = inngest.createFunction(
  { id: "check-bills-due", retries: 1 },
  [{ event: "bills/check.due" }, { cron: "TZ=America/New_York 0 8 * * *" }],
  async ({ step }) => {
    const horizon = addDays(new Date(), 7);

    const liabilities = await step.run("find-due-soon", () =>
      db.liability.findMany({
        where: { nextPaymentDueDate: { lte: horizon, gte: new Date() } },
        include: {
          user: { select: { id: true, email: true, name: true } },
          finAccount: { select: { name: true, mask: true } },
        },
      }),
    );

    let sent = 0;
    for (const l of liabilities) {
      const dueDate = l.nextPaymentDueDate ? new Date(l.nextPaymentDueDate) : null;
      const dueIso = dueDate ? dueDate.toISOString().slice(0, 10) : "unknown";
      const dedupeKey = `payment_due:${l.id}:${dueIso}`;
      const existing = await db.notification.findUnique({ where: { dedupeKey } });
      if (existing) continue;

      const dueStr = dueDate ? format(dueDate, "EEE, MMM d") : "soon";
      const subject = `${l.finAccount.name} payment due ${dueStr}`;
      const body = `${l.finAccount.name} (••${l.finAccount.mask ?? "?"}) — minimum ${formatMoney(l.minimumPaymentAmount)}, statement balance ${formatMoney(l.lastStatementBalance)}. Due ${dueStr}.`;

      if (resend && l.user.email) {
        await step.run(`email-${l.id}`, () =>
          resend.emails.send({
            from: process.env.AUTH_EMAIL_FROM ?? "onboarding@resend.dev",
            to: l.user.email,
            subject,
            text: body,
          }),
        );
      }

      await step.run(`record-${l.id}`, () =>
        db.notification.create({
          data: {
            userId: l.user.id,
            kind: "payment_due",
            dedupeKey,
            payload: { subject, body, liabilityId: l.id },
          },
        }),
      );
      sent += 1;
    }

    return { checked: liabilities.length, sent };
  },
);
