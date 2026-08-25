# FinMan

Personal finance dashboard. Connects Chase / Discover / Amex / Marcus / Cash App / Robinhood via Plaid, syncs transactions in the background, categorizes via Plaid + Claude, surfaces payment-due alerts, and generates weekly AI insights.

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind v4
- Postgres + Prisma 6
- Plaid (Transactions, Liabilities, Investments)
- Inngest (background jobs + cron)
- NextAuth v5 with Resend magic-link email
- Anthropic Claude Haiku 4.5 (categorization + insights)
- Recharts

## Architecture

Dashboard never blocks on Plaid. Plaid → webhook → Inngest job → DB upsert → dashboard reads from DB.

```
[Plaid Link]  ──public_token──▶  /api/plaid/exchange  ──▶  PlaidItem + FinAccounts (DB)
                                                       └─▶  inngest.send(plaid/sync.*)

[Plaid webhook] ──▶ /api/plaid/webhook ──▶ inngest.send(plaid/sync.transactions | liabilities | holdings)

[Inngest worker]  pulls cursor-based /transactions/sync, upserts txns, fires
                  txn/categorize.batch for low-confidence rows.

[Daily cron]      check-bills-due → email reminders via Resend.
[Weekly cron]     generate-insights → Claude Haiku summary → cached in DB.
```

## Local setup

```bash
# 1. Install deps (legacy peers — next-auth beta still lags next 16's peer range)
npm install --legacy-peer-deps

# 2. Copy env and fill in the values
cp .env.example .env.local

# 3. Generate encryption + auth secrets
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"

# 4. Spin up Postgres (any method). Quick option:
#    docker run -d --name finman-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
#    Then set DATABASE_URL=postgres://postgres:postgres@localhost:5432/finman

# 5. Push schema
npm run db:push

# 6. Run the app
npm run dev                # http://localhost:3000

# 7. In a second terminal, run the Inngest dev server (handles webhooks + cron locally)
npm run inngest:dev        # http://localhost:8288
```

### Plaid setup

1. Sign up at https://dashboard.plaid.com — free.
2. Copy `client_id` and `sandbox` secret into `.env.local`.
3. Start with `PLAID_ENV=sandbox` — Plaid Link will accept the test credentials `user_good / pass_good` (any institution).
4. When ready for real accounts, request access to **Development** mode in the Plaid dashboard. Dev mode supports up to 100 real linked items at no cost; perfect for this use case.

### Webhooks in local dev

Plaid needs to hit `/api/plaid/webhook` from the public internet. Use a Cloudflare quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
# Set in .env.local:
#   PLAID_WEBHOOK_URL=https://<random>.trycloudflare.com/api/plaid/webhook
```

Install it once with `winget install --id Cloudflare.cloudflared`. Quick tunnels need no
Cloudflare account, but the hostname changes on every restart — update `PLAID_WEBHOOK_URL`
and the Plaid dashboard whenever you restart the tunnel. For a stable hostname, use a named
tunnel against a domain you control.

Webhooks are non-fatal — if `PLAID_WEBHOOK_URL` is empty, Link still works, you just have to trigger syncs manually until a webhook is configured.

### Webhook signature verification

The webhook receiver verifies the `Plaid-Verification` JWT header in `src/lib/plaid-webhook.ts`,
fetching Plaid's ES256 signing key by `kid`, rejecting stale `iat` values to blunt replay, and
constant-time comparing the `request_body_sha256` claim against the raw body. Unverified requests
are rejected before any handler runs. See: https://plaid.com/docs/api/webhooks/webhook-verification/

## Project layout

```
prisma/schema.prisma         Postgres schema (users, plaid items, txns, liabilities, holdings, …)
src/lib/
  db.ts                      Prisma singleton
  auth.ts                    NextAuth config (Resend provider, Prisma adapter)
  plaid.ts                   Plaid SDK client + product lists
  crypto.ts                  AES-256-GCM for Plaid access tokens
  inngest.ts                 Inngest client + typed event schemas
  categories.ts              Canonical category list + Plaid PFC mapping
  queries.ts                 Dashboard DB reads
  money.ts                   Decimal/currency helpers
src/inngest/functions/       sync-transactions, sync-balances, sync-liabilities,
                             sync-holdings, categorize-batch, check-bills-due,
                             generate-insights
src/app/api/
  auth/[...nextauth]/        NextAuth handlers
  plaid/link/                POST → link_token
  plaid/exchange/            POST → exchanges public_token, creates PlaidItem,
                                    kicks off first sync
  plaid/webhook/             POST → enqueues Inngest events
  inngest/                   Inngest function registration handler
src/app/
  page.tsx                   Dashboard (net worth, charts, recent txns, upcoming bills)
  accounts/                  All linked accounts grouped by institution
  transactions/              Searchable transaction list
  insights/                  AI-generated weekly summaries
  signin/                    Magic-link sign-in
src/components/
  plaid-link-button.tsx      Client-side Plaid Link launcher
  charts.tsx                 Recharts wrappers
  app-nav.tsx                Top nav + sign-out
```

## What's intentionally not built yet

- Plaid webhook JWT verification (placeholder — see above)
- Manual CSV import for Cash App (Plaid coverage is patchy there)
- Investment transaction sync (we sync **holdings**, not Robinhood trade history yet)
- User-facing category rules UI (rules apply server-side; no edit page yet)
- Net-worth-over-time chart (requires daily balance snapshots — needs a cron)
- Email template polish (plain text only for now)
- Multi-user signup UX (works but bare; intended for friends/family invite)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run inngest:dev` | Inngest dev server (executes background jobs locally) |
| `npm run db:push` | Apply Prisma schema to DB without migrations |
| `npm run db:studio` | Prisma Studio (DB browser) |
| `npm run db:generate` | Regenerate Prisma client after schema edits |
| `npm run build` | Production build |
