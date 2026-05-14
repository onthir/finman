// Canonical category list. Plaid's personal_finance_category PRIMARY values
// map onto these. Users may also assign these via rules / manual override.

export const CATEGORIES = [
  "Food & Drink",
  "Groceries",
  "Transportation",
  "Travel",
  "Rent & Housing",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Personal Care",
  "Health",
  "Education",
  "Subscriptions",
  "Fees & Charges",
  "Taxes",
  "Insurance",
  "Gifts & Donations",
  "Income",
  "Transfer",
  "Investment",
  "Loan Payment",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Map Plaid personal_finance_category.primary → our canonical Category.
// Plaid PFC primary values are stable, documented strings.
const PFC_MAP: Record<string, Category> = {
  INCOME: "Income",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  LOAN_PAYMENTS: "Loan Payment",
  BANK_FEES: "Fees & Charges",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Food & Drink",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Shopping",
  MEDICAL: "Health",
  PERSONAL_CARE: "Personal Care",
  GENERAL_SERVICES: "Other",
  GOVERNMENT_AND_NON_PROFIT: "Gifts & Donations",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Utilities",
};

// Detailed overrides for things the primary buckets get wrong.
const PFC_DETAILED_MAP: Record<string, Category> = {
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  RENT_AND_UTILITIES_RENT: "Rent & Housing",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Utilities",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Utilities",
  RENT_AND_UTILITIES_WATER: "Utilities",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Utilities",
  RENT_AND_UTILITIES_TELEPHONE: "Utilities",
  GENERAL_SERVICES_INSURANCE: "Insurance",
  GENERAL_SERVICES_EDUCATION: "Education",
  GENERAL_SERVICES_SUBSCRIPTIONS: "Subscriptions",
  GENERAL_SERVICES_AUTOMOTIVE: "Transportation",
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "Fees & Charges",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Taxes",
};

export function mapPlaidCategory(
  primary: string | null | undefined,
  detailed: string | null | undefined,
): Category {
  if (detailed && PFC_DETAILED_MAP[detailed]) return PFC_DETAILED_MAP[detailed];
  if (primary && PFC_MAP[primary]) return PFC_MAP[primary];
  return "Other";
}

export function applyCategoryRules(
  rules: { matchPattern: string; category: string }[],
  merchantName: string | null,
  name: string,
): string | null {
  const hay = `${merchantName ?? ""} ${name}`.toLowerCase();
  for (const r of rules) {
    if (hay.includes(r.matchPattern.toLowerCase())) return r.category;
  }
  return null;
}
