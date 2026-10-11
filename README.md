# Dewlune · COD-to-Prepaid Decision Engine

Concept prototype for the Razorpay AI PM Build Challenge, Track 2. **Synthetic data, fictional merchant ("Dewlune").**
Spec: [`docs/cod-prepaid-prototype-spec.md`](docs/cod-prepaid-prototype-spec.md) (v2).

**Live:** https://cod-prepaid-engine.vercel.app

## What it does
For each repeat customer who orders cash on delivery, an AI model predicts how they'd respond to no message, a reminder,
or a ₹50 off offer. A separate calculation picks the most profitable action, an LLM writes the message, the merchant
approves, and a randomised control group measures the extra profit. Outcomes retrain the model.

## How the data works
- **Real dates (IST).** The last 29 days are seeded with orders, an evening campaign each day, customer responses and delivery outcomes.
- **Today** has no campaign. Orders keep arriving through the day; they appear on page load or when you click **Refresh**.
- After midnight a new day starts automatically. Delivery outcomes land 3–5 days after dispatch.
- Live campaign responses (opened, clicked, paid online) arrive within ~3 minutes of sending.

## Reset everything (outside the app)
Open **`/admin/reset?token=<SETUP_TOKEN>`** and click *Reset everything* (about 2 minutes). It wipes the database and rebuilds
the 30 days. The link is not shown anywhere in the dashboard. Bookmark it.

## Setup from scratch
1. Supabase project (Mumbai). Apply `db/migrations/*.sql` in order (`npm run db:migrate` with `DATABASE_URL` set).
2. Vercel project from this repo; env vars: `DATABASE_URL` (Supabase **transaction pooler** string), `ANTHROPIC_API_KEY`,
   `LLM_MODEL` (default `claude-haiku-5-5`), `SETUP_TOKEN` (any secret string).
3. Open `/admin/reset?token=…` once to build the data.

Local: `cp .env.example .env.local`, fill the values, then `npm install && npm run dev`. `npm test` runs the unit tests
(decision function incl. the spec's worked example, simulation, model, LLM output checks).

## Razorpay logo
The app shows a "Razorpay" wordmark. To use the official logo, add the file from Razorpay's brand assets as
`public/razorpay-logo.svg` (or `.png`) and redeploy.

## 90-second video path
1. **Overview** (today selected): date pills, today's orders so far → click **Refresh** to pull new orders; COD cost at stake.
2. **Run campaign on N orders** in today's panel → progress with stages and time left → open another page → "Campaign … is ready" notification.
3. **Review & send** → three decision cards (orders, expected extra profit, sample AI message) → edit one message → **Approve & send** → pop-up summary → **Confirm**.
4. **Why? ↗** on any order → Inspector: why the reminder beat the offer, step by step.
5. Back on the campaign: responses arrive (opened, clicked, paid online) → then open an older day (e.g. 10 days ago) → **View results** → extra profit vs control.
6. **Model** → daily diagnostics chart and table → **Retrain model** → compare v1 vs v2 → **Promote**.
