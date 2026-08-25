"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight } from "lucide-react";

type Category = {
  id: string;
  name: string;
  amount: number;
  actual: number;
  monthlySpend: number[];
};

type TxnRow = {
  id: string;
  date: string;
  rawDate: string;
  name: string;
  amount: number;
  category: string | null;
  accountName: string;
  budgetCategoryId: string | null;
  explicit: boolean;
};

type Props = {
  budgetId: string;
  month: string;
  initialCategories: Category[];
  initialTransactions: TxnRow[];
};

export function BudgetEditor({ budgetId, month, initialCategories, initialTransactions }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [transactions, setTransactions] = useState<TxnRow[]>(initialTransactions);

  // Adding a new category
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [adding, setAdding] = useState(false);

  // Editing a category
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");

  // Expanded category (for transaction panel)
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalBudget = categories.reduce((s, c) => s + c.amount, 0);
  const totalActual = categories.reduce((s, c) => s + c.actual, 0);
  const totalRemaining = totalBudget - totalActual;
  const totalPct = totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 100) : 0;

  async function addCategory() {
    const name = newName.trim();
    const amount = parseFloat(newAmount);
    if (!name || isNaN(amount) || amount < 0) return;

    const res = await fetch("/api/budget/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ budgetId, name, amount }),
    });
    if (!res.ok) return;
    const cat = await res.json();

    // Auto-match transactions by category name
    const autoActual = transactions
      .filter((t) => !t.budgetCategoryId && t.category?.toLowerCase() === name.toLowerCase())
      .reduce((s, t) => s + t.amount, 0);

    setCategories((prev) => [...prev, { id: cat.id, name, amount, actual: autoActual, monthlySpend: Array(5).fill(0).concat([autoActual]) }]);
    // Update auto-matched transactions to reflect new category
    setTransactions((prev) =>
      prev.map((t) =>
        !t.explicit && !t.budgetCategoryId && t.category?.toLowerCase() === name.toLowerCase()
          ? { ...t, budgetCategoryId: cat.id }
          : t,
      ),
    );
    setNewName("");
    setNewAmount("");
    setAdding(false);
  }

  function startEdit(cat: Category) {
    setEditId(cat.id);
    setEditName(cat.name);
    setEditAmount(String(cat.amount));
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    const amount = parseFloat(editAmount);
    if (!name || isNaN(amount)) return;

    await fetch(`/api/budget/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, amount }),
    });

    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name, amount } : c)),
    );
    setEditId(null);
  }

  async function deleteCategory(id: string) {
    await fetch(`/api/budget/categories/${id}`, { method: "DELETE" });
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setTransactions((prev) =>
      prev.map((t) => (t.budgetCategoryId === id ? { ...t, budgetCategoryId: null } : t)),
    );
    if (expanded === id) setExpanded(null);
  }

  async function assignTransaction(txnId: string, categoryId: string | null) {
    const prevTxns = transactions;
    const txn = transactions.find((t) => t.id === txnId)!;
    const oldCatId = txn.budgetCategoryId;

    // Optimistic update
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txnId ? { ...t, budgetCategoryId: categoryId, explicit: categoryId !== null } : t,
      ),
    );
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === oldCatId) return { ...c, actual: c.actual - txn.amount };
        if (c.id === categoryId) return { ...c, actual: c.actual + txn.amount };
        return c;
      }),
    );

    const res = await fetch(`/api/transactions/${txnId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ budgetCategoryId: categoryId }),
    });

    if (!res.ok) {
      // Rollback
      setTransactions(prevTxns);
      setCategories(initialCategories);
      startTransition(() => router.refresh());
    }
  }

  const catTxns = (catId: string) =>
    transactions.filter((t) => t.budgetCategoryId === catId);

  const unassigned = transactions.filter((t) => !t.budgetCategoryId);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap gap-8 items-end">
          <Stat label="Total budget" value={formatMoney(totalBudget)} large />
          <Stat label="Spent so far" value={formatMoney(totalActual)} />
          <Stat
            label="Remaining"
            value={(totalRemaining < 0 ? "−" : "+") + formatMoney(Math.abs(totalRemaining))}
            color={totalRemaining < 0 ? "text-rose-600" : "text-emerald-600"}
          />
        </div>
        {totalBudget > 0 && (
          <div className="mt-4 h-2 rounded-full bg-stone-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalPct >= 100 ? "bg-rose-500" : totalPct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-indigo-400 to-violet-500"
              }`}
              style={{ width: `${totalPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Budget categories */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/60 flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-800">Categories</span>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Add category
            </button>
          )}
        </div>

        {categories.length === 0 && !adding && (
          <div className="px-5 py-10 text-center text-sm text-stone-400">
            No budget categories yet. Add one to get started.
          </div>
        )}

        {categories.map((cat) => {
          const pct = cat.amount > 0 ? Math.min((cat.actual / cat.amount) * 100, 100) : 0;
          const over = cat.amount > 0 && cat.actual > cat.amount;
          const warn = cat.amount > 0 && pct >= 80 && !over;
          const remaining = cat.amount - cat.actual;
          const txns = catTxns(cat.id);
          const isExpanded = expanded === cat.id;
          const isEditing = editId === cat.id;

          return (
            <div key={cat.id} className="border-b border-stone-100 last:border-0">
              {isEditing ? (
                <div className="flex items-center gap-2 px-5 py-3">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(cat.id)}
                    className="flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                    placeholder="Category name"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">$</span>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(cat.id)}
                      className="w-28 rounded-lg border border-stone-200 pl-6 pr-2 py-1.5 text-sm text-right outline-none focus:border-indigo-400"
                      placeholder="0"
                    />
                  </div>
                  <button onClick={() => saveEdit(cat.id)} className="text-emerald-600 hover:text-emerald-700">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="text-stone-400 hover:text-stone-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <div
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-stone-50/50 transition"
                    onClick={() => setExpanded(isExpanded ? null : cat.id)}
                  >
                    <span className="text-stone-400 w-4 flex-shrink-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 font-medium text-stone-800 text-sm">{cat.name}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <Sparkline values={cat.monthlySpend} budget={cat.amount} />
                      <span className="text-stone-500 tabular">{formatMoney(cat.actual)} spent</span>
                      <span className="text-stone-400">of</span>
                      <span className="font-semibold text-stone-900 tabular">{formatMoney(cat.amount)}</span>
                      <span className={`font-semibold tabular w-24 text-right ${
                        cat.amount === 0 ? "text-stone-300" : over ? "text-rose-600" : warn ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        {cat.amount === 0 ? "—" : remaining < 0 ? `−${formatMoney(Math.abs(remaining))}` : `+${formatMoney(remaining)}`}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(cat); }}
                      className="ml-2 text-stone-400 hover:text-stone-600 transition"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                      className="text-stone-400 hover:text-rose-500 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {cat.amount > 0 && (
                    <div className="px-5 pb-2 pl-12">
                      <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${over ? "bg-rose-400" : warn ? "bg-amber-400" : "bg-gradient-to-r from-indigo-400 to-violet-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {isExpanded && (
                    <div className="bg-stone-50/40 border-t border-stone-100">
                      {txns.length === 0 ? (
                        <p className="px-12 py-4 text-xs text-stone-400">No transactions assigned to this category.</p>
                      ) : (
                        <>
                          <CategoryCalendar transactions={txns} month={month} />
                          <table className="w-full text-sm border-t border-stone-100">
                            <tbody>
                              {txns.map((t) => (
                                <TxnAssignRow
                                  key={t.id}
                                  txn={t}
                                  categories={categories}
                                  onAssign={assignTransaction}
                                />
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add category inline */}
        {adding && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-stone-100 bg-stone-50/40">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              className="flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
              placeholder="Category name (e.g. Rent)"
            />
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">$</span>
              <input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                className="w-28 rounded-lg border border-stone-200 pl-6 pr-2 py-1.5 text-sm text-right outline-none focus:border-indigo-400"
                placeholder="0"
              />
            </div>
            <button onClick={addCategory} className="rounded-lg bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-indigo-700 transition">
              Save
            </button>
            <button onClick={() => { setAdding(false); setNewName(""); setNewAmount(""); }} className="text-stone-400 hover:text-stone-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Unassigned transactions */}
      {unassigned.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/60 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-800">Unassigned transactions</span>
            <span className="text-xs text-stone-400">{unassigned.length} transactions</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {unassigned.map((t) => (
                <TxnAssignRow
                  key={t.id}
                  txn={t}
                  categories={categories}
                  onAssign={assignTransaction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TxnAssignRow({
  txn,
  categories,
  onAssign,
}: {
  txn: TxnRow;
  categories: Category[];
  onAssign: (id: string, catId: string | null) => void;
}) {
  return (
    <tr className="border-b border-stone-100 last:border-0 hover:bg-white transition">
      <td className="pl-12 pr-3 py-2.5 text-stone-400 text-xs whitespace-nowrap w-20">{txn.date}</td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-stone-800">{txn.name}</div>
        <div className="text-xs text-stone-400">{txn.accountName}</div>
      </td>
      <td className="px-3 py-2.5 text-right font-semibold text-stone-900 tabular whitespace-nowrap">
        {formatMoney(txn.amount)}
      </td>
      <td className="pl-3 pr-5 py-2.5 w-48">
        <select
          value={txn.budgetCategoryId ?? ""}
          onChange={(e) => onAssign(txn.id, e.target.value || null)}
          className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400 text-stone-700"
        >
          <option value="">— Unassigned —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </td>
    </tr>
  );
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CategoryCalendar({ transactions, month }: { transactions: TxnRow[]; month: string }) {
  const [year, monthNum] = month.split("-").map(Number);
  const firstDayOfWeek = new Date(year, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const byDay = new Map<number, { amount: number; names: string[] }>();
  for (const t of transactions) {
    const day = parseInt(t.rawDate.split("-")[2]);
    const cur = byDay.get(day) ?? { amount: 0, names: [] };
    cur.amount += t.amount;
    cur.names.push(t.name);
    byDay.set(day, cur);
  }

  const amounts = [...byDay.values()].map((v) => v.amount).filter((v) => v > 0);
  const maxAmt = Math.max(...amounts, 1);
  const minAmt = Math.min(...amounts, maxAmt);

  function cellColor(day: number) {
    const entry = byDay.get(day);
    if (!entry || entry.amount === 0) return undefined;
    const ratio = amounts.length <= 1 ? 1 : (entry.amount - minAmt) / (maxAmt - minAmt);
    // green (120°) → red (0°)
    const hue = Math.round(120 - ratio * 120);
    return `hsl(${hue}, 70%, 85%)`;
  }

  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  return (
    <div className="px-5 pt-4 pb-3">
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-stone-400 pb-1">
            {d}
          </div>
        ))}
        {Array.from({ length: totalCells }, (_, i) => {
          const day = i - firstDayOfWeek + 1;
          const valid = day >= 1 && day <= daysInMonth;
          const entry = valid ? byDay.get(day) : undefined;
          const bg = valid ? cellColor(day) : undefined;
          return (
            <div
              key={i}
              title={entry ? `${formatMoney(entry.amount)}\n${entry.names.join(", ")}` : undefined}
              className="rounded-md h-9 flex flex-col items-center justify-center transition"
              style={{ background: bg ?? (valid ? "#f9fafb" : "transparent") }}
            >
              {valid && (
                <>
                  <span className={`text-[11px] font-semibold leading-none ${entry ? "text-stone-800" : "text-stone-400"}`}>
                    {day}
                  </span>
                  {entry && (
                    <span className="text-[9px] leading-none mt-0.5 text-stone-600 tabular">
                      {formatMoney(entry.amount)}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {amounts.length > 0 && (
        <div className="flex items-center gap-2 mt-3 justify-end">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "hsl(120,70%,85%)" }} />
            <span className="text-[10px] text-stone-400">less</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "hsl(60,70%,85%)" }} />
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "hsl(0,70%,85%)" }} />
            <span className="text-[10px] text-stone-400">more</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ values, budget }: { values: number[]; budget: number }) {
  const max = Math.max(...values, budget * 0.1, 1);
  return (
    <div className="flex items-end gap-px h-6 w-14 flex-shrink-0" title="Last 6 months">
      {values.map((v, i) => {
        const isCurrent = i === values.length - 1;
        const pct = Math.max((v / max) * 100, v > 0 ? 8 : 0);
        const over = budget > 0 && v > budget;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${pct}%`,
              background: isCurrent
                ? over
                  ? "#f87171"
                  : "linear-gradient(to top, #818cf8, #a78bfa)"
                : "#d1d5db",
            }}
          />
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  large,
  color,
}: {
  label: string;
  value: string;
  large?: boolean;
  color?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-stone-500 font-medium">{label}</div>
      <div className={`font-bold tabular ${large ? "text-3xl" : "text-2xl"} ${color ?? "text-stone-900"}`}>
        {value}
      </div>
    </div>
  );
}
