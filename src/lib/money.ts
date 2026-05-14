import { Prisma } from "@prisma/client";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMoney(
  amount: number | string | Prisma.Decimal | null | undefined,
): string {
  if (amount == null) return "—";
  const n = typeof amount === "number" ? amount : Number(amount.toString());
  return fmt.format(n);
}

export function toNumber(
  amount: number | string | Prisma.Decimal | null | undefined,
): number {
  if (amount == null) return 0;
  return typeof amount === "number" ? amount : Number(amount.toString());
}
