import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  plaid,
  PLAID_PRODUCTS,
  PLAID_OPTIONAL_PRODUCTS,
  PLAID_COUNTRY_CODES,
} from "@/lib/plaid";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.PLAID_WEBHOOK_URL;

  const res = await plaid.linkTokenCreate({
    user: { client_user_id: session.user.id },
    client_name: "FinMan",
    products: PLAID_PRODUCTS,
    optional_products: PLAID_OPTIONAL_PRODUCTS,
    country_codes: PLAID_COUNTRY_CODES,
    language: "en",
    webhook: webhookUrl,
  });

  return NextResponse.json({ link_token: res.data.link_token });
}
