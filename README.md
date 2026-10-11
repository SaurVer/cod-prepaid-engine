# PayShift · COD-to-Prepaid Decision Engine

Concept prototype for the Razorpay AI PM Build Challenge, Track 2. **Synthetic data, fictional merchant ("Elvora", Skin · Hair · Wellness).**
Spec: [`docs/cod-prepaid-prototype-spec.md`](docs/cod-prepaid-prototype-spec.md) (v3).

**Live:** https://cod-prepaid-engine.vercel.app

## What it does
For each repeat customer who orders cash on delivery, an AI model predicts how they'd respond to no message, a reminder,
or a ₹50 off offer. A separate calculation picks the most profitable action, an LLM writes the message, the merchant
approves, and a randomised control group measures the extra profit. Outcomes retrain the model.

## How the data works
- **Real dates (IST).** The last 29 days are seeded with orders and everything that happened to them (self-switches to prepaid, cancellations, shipping, deliveries), but **no campaigns**. You run them.
- **A campaign on a past day is a replay:** it counts as sent at 9 PM that evening. When you send it, responses, shipping and deliveries up to now are filled in straight away, so the result appears immediately (fully measured for days older than ~5 days).
- **Today** keeps receiving orders through the day; they appear when you open the Overview or click **Refresh** (Overview only).
- Live campaigns on today's orders get responses (opened, clicked, paid online) within ~3 minutes. Delivery outcomes land 3–5 days after dispatch.
- **Control group** (no message; measures profit and trains the model) and **random test** (random reminder or offer; trains the model) sizes are set per campaign in the Run campaign dialog. Defaults are in Settings; the random test can be 0%.

## Where things are
- **Overview** — hero, range (7/14/30/custom), filters, days. Open a day → Run campaign.
- **Campaigns** — every campaign, and a dedicated window per campaign for review, Approve & send, and results.
- **Orders** — every order, filterable; each links to the Inspector.
- **Model** — training data available and what it looks like, model parameters, per-campaign run outputs (every order's predictions, expected profit per action and decision), accuracy, retrain and promote.
- **Settings** — economics, control / random-test defaults, integrations, audit log.

## Reset everything (outside the app)
Open **`/admin/reset?token=<SETUP_TOKEN>`** and click *Reset everything* (about 2 minutes). It wipes the database and rebuilds
the 30 days. The link is not shown anywhere in the dashboard. Bookmark it.

## Setup from scratch
1. Supabase project (Mumbai). Apply `db/migrations/*.sql` in order (`npm run db:migrate` with `DATABASE_URL` set).
2. Vercel project from this repo; env vars: `DATABASE_URL` (Supabase **transaction pooler** string), `ANTHROPIC_API_KEY`,
   `LLM_MODEL` (default `claude-haiku-5-5`), `SETUP_TOKEN` (any secret string).
3. Open `/admin/reset?token=…` once to build the data.

Local: `cp .env.example .env.local`, fill the values, then `npm install && npm run dev`. `npm test` runs the unit tests
(decision function incl. the spec's worked example, simulation, model, LLM output checks). `scripts/integration.ts` runs the
whole loop against a local Postgres, including a past-day replay.

## Razorpay logo
The app shows a "Razorpay" wordmark. To use the official logo, add the file from Razorpay's brand assets as
`public/razorpay-logo.svg` (or `.png`) and redeploy.

## 90-second video path
1. **Overview**: the hero says what PayShift does → open a past day (e.g. 10 days ago) → COD cost at stake.
2. **Run campaign** → dialog: control group % and random test %, with what each is for → **Start campaign** → the campaign window shows progress with stages and time left.
3. **Review & send** → three decision cards (orders, expected extra profit, sample AI message) → edit one message → **Approve & send** → pop-up summary → **Confirm** → paid online and **extra profit vs control** appear at once, with the equation.
4. **Why? ↗** on any order → Inspector: why the reminder beat the offer, step by step.
5. Back to **Overview → Today** → run today's campaign → responses arrive within minutes.
6. **Model** → training data available → Parameters → Run outputs → open the day you just ran → **Retrain model** → Accuracy → **Promote**.
