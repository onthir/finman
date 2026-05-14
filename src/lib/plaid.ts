import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";

function envValue(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let _plaid: PlaidApi | undefined;

function buildClient(): PlaidApi {
  const env = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  if (!(env in PlaidEnvironments)) {
    throw new Error(`Unknown PLAID_ENV: ${env}`);
  }
  const config = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": envValue("PLAID_CLIENT_ID"),
        "PLAID-SECRET": envValue("PLAID_SECRET"),
        "Plaid-Version": "2020-09-14",
      },
    },
  });
  return new PlaidApi(config);
}

// Lazy proxy: env vars are only required when an actual Plaid call is made,
// not at import time. Keeps `next build` working without credentials.
export const plaid = new Proxy({} as PlaidApi, {
  get(_, prop, receiver) {
    if (!_plaid) _plaid = buildClient();
    return Reflect.get(_plaid, prop, receiver);
  },
});

export const PLAID_PRODUCTS: Products[] = [Products.Transactions];

export const PLAID_OPTIONAL_PRODUCTS: Products[] = [
  Products.Liabilities,
  Products.Investments,
];

export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];
