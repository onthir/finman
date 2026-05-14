import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { ResyncButton } from "@/components/resync-button";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { format } from "date-fns";
import { Wallet, CreditCard, PiggyBank, LineChart } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  depository: { label: "Cash", icon: Wallet, tint: "bg-emerald-50 text-emerald-700" },
  credit: { label: "Credit", icon: CreditCard, tint: "bg-rose-50 text-rose-700" },
  loan: { label: "Loan", icon: CreditCard, tint: "bg-amber-50 text-amber-700" },
  investment: { label: "Investment", icon: LineChart, tint: "bg-indigo-50 text-indigo-700" },
  other: { label: "Other", icon: PiggyBank, tint: "bg-stone-100 text-stone-700" },
};

function meta(type: string) {
  return TYPE_META[type] ?? TYPE_META.other;
}

export default async function AccountsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const items = await db.plaidItem.findMany({
    where: { userId },
    include: {
      finAccounts: {
        orderBy: { type: "asc" },
        include: { liability: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <AppNav email={session?.user?.email} />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Accounts
            </h1>
            <p className="text-sm text-stone-500">
              {items.length} institution{items.length === 1 ? "" : "s"} connected
            </p>
          </div>
          <div className="flex gap-2">
            <ResyncButton />
            <PlaidLinkButton />
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center text-sm text-stone-500">
            No institutions connected yet.
          </div>
        ) : (
          items.map((item) => (
            <section
              key={item.id}
              className="rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <div>
                  <div className="font-semibold text-stone-900">
                    {item.institutionName}
                  </div>
                  <div className="text-xs text-stone-500">
                    <StatusPill status={item.status} />
                    {item.lastSyncedAt
                      ? ` · synced ${format(item.lastSyncedAt, "MMM d, h:mm a")}`
                      : " · not synced yet"}
                  </div>
                </div>
              </div>
              <ul className="divide-y divide-stone-100">
                {item.finAccounts.map((a) => {
                  const m = meta(a.type);
                  const Icon = m.icon;
                  const bal = Number(a.currentBalance?.toString() ?? 0);
                  const isLiability = a.type === "credit" || a.type === "loan";
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 px-5 py-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`inline-grid h-9 w-9 place-items-center rounded-xl ${m.tint}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-stone-900">
                            {a.name}
                          </div>
                          <div className="text-xs text-stone-500">
                            ••{a.mask ?? "?"} ·{" "}
                            <span className="capitalize">
                              {a.subtype ?? m.label}
                            </span>
                          </div>
                          {a.liability?.nextPaymentDueDate && (
                            <div className="mt-1 text-xs text-amber-700">
                              Payment due{" "}
                              {format(a.liability.nextPaymentDueDate, "MMM d")}
                              {" · min "}
                              {formatMoney(a.liability.minimumPaymentAmount)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-base font-semibold tabular ${
                            isLiability ? "text-rose-600" : "text-stone-900"
                          }`}
                        >
                          {formatMoney(bal)}
                        </div>
                        {a.availableBalance != null && (
                          <div className="text-xs text-stone-500 tabular">
                            avail {formatMoney(a.availableBalance)}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "error" || status === "login_required"
        ? "bg-rose-100 text-rose-700"
        : "bg-stone-100 text-stone-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${styles}`}>
      {status}
    </span>
  );
}
