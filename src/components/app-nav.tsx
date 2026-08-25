import Link from "next/link";
import { signOut } from "@/lib/auth";
import { LayoutDashboard, Wallet, Receipt, Sparkles, PiggyBank } from "lucide-react";

export function AppNav({ email }: { email?: string | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold tracking-tight text-stone-900"
        >
          <span className="inline-grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-sm">
            ƒ
          </span>
          FinMan
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/" icon={<LayoutDashboard className="h-4 w-4" />}>
            Dashboard
          </NavLink>
          <NavLink href="/accounts" icon={<Wallet className="h-4 w-4" />}>
            Accounts
          </NavLink>
          <NavLink href="/transactions" icon={<Receipt className="h-4 w-4" />}>
            Transactions
          </NavLink>
          <NavLink href="/insights" icon={<Sparkles className="h-4 w-4" />}>
            Insights
          </NavLink>
          <NavLink href="/budget" icon={<PiggyBank className="h-4 w-4" />}>
            Budget
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-stone-500">{email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition"
    >
      {icon}
      {children}
    </Link>
  );
}
