# Build spec: COD-to-Prepaid Decision Engine (prototype) · v2

Concept prototype for the Razorpay AI PM Build Challenge, Track 2 ("Recover and Grow with AI"). Built on synthetic data. Every screen shows a small "Concept prototype · synthetic data" label.

Deadline: submission due 13 Oct 2026, 11:59 PM IST. **A working core loop beats a half-built everything.** Visible behaviour should feel like a real product; plumbing stays simple.

The part to protect at all costs:
**live order flow → real model → real EV calculation → real LLM draft → merchant approval → simulated customer response → randomised control group → measured extra profit → Inspector explanation → retraining.**

> **What changed in v2** (from merchant review of the P0 build): real calendar dates instead of a simulated clock; 30 days of seeded history; today's orders arrive through the day and appear on Refresh; no Pause / Advance controls; date-first Overview with pills, filters and expandable days; campaigns run from the day itself; plain-language labels; one-click Approve & send with a confirmation pop-up; customer responses arrive within minutes of sending; Orders and Model pages populated with daily diagnostics; a reset link outside the app; new merchant "Dewlune" with its own logo; Razorpay visual theme.

---

## 1. Product in brief

D2C merchants offer cash on delivery (COD) because new customers don't yet trust them, but COD orders cost money: returns (RTO), cash handling and delayed cash. Today merchants send the same prepaid discount to every COD customer, and much of it goes to customers who would have switched with a plain reminder.

For each eligible COD order this product decides which of three actions earns the merchant the most:

1. **No message**
2. **Reminder**: a pay-online link with no discount (internally "nudge")
3. **₹50 off offer**: a pay-online link with ₹X off (internally "discount"; ₹50 by default, set by the merchant)

A predictive model estimates the probability of each outcome under each action. A separate calculation turns those probabilities into expected profit and picks the best action. An LLM then writes the message; it changes the wording only, never the decision. The merchant reviews and approves before anything is sent. Outcomes flow back and retrain the model.

**MVP scope**
- Merchant: one fictional wellness & beauty D2C brand, **"Dewlune"** (skincare, supplements, haircare). Never use a real brand.
- Eligible orders: **repeat customers** (at least one past delivered order) placing a **COD** order that has not yet been dispatched.
- Excluded from decisions but counted on the dashboard: first-time customers, prepaid orders, orders flagged high return risk.
- Data: the merchant's own first-party data only.
- Merchants: only those who share delivery outcomes with Razorpay (courier delivery-status integration connected).

---

## 2. Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Database | Supabase Postgres (database only) | No pg_cron, no Edge Functions, no Realtime. |
| App | Next.js (App Router) + TypeScript + Tailwind | API routes do all server work. Dashboard routes plus the separate Inspector at `/inspector`. |
| Grids | TanStack Table | Campaign orders grid and Orders explorer. |
| Charts | Recharts | Trends, results, model diagnostics. |
| Live order flow | **Real-time sync on page load and on Refresh** | Each page load or Refresh click tops today's orders up to what should have arrived by now and resolves anything due. No cron. |
| Campaign processing | Chunked API calls (~200 orders per call) | A tracker in the app shell keeps calling the next chunk while the user moves around, so progress % and ETA are real. |
| Notifications | `notifications` table + light polling | Toast + bell for "campaign ready". |
| LLM | Anthropic API, model from env `LLM_MODEL` | Message drafting only. |
| Hosting | Vercel (functions in Mumbai, next to the database) | |

Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `SETUP_TOKEN`. Environment variables only; commit `.env.example` only.

---

## 3. Time model and data flow (replaces the simulated clock)

**Real dates, Indian time (IST).** The dashboard always works on the real calendar. There is no "sim time", no Pause and no Advance.

**History (seeded).** Setup creates the **last 30 days** of the store:
- Days −29 … −1: full order days. On each day a campaign ran in the evening (around 9 PM) on that day's eligible orders, with the same model → decision → message → send → response → outcome pipeline. Historical messages use the fixed templates (Appendix E) rather than live LLM calls, and are labelled as templates.
- Today (day 0): **not run**. Orders keep arriving through the day.
- Before the 30 days: a 30-day randomised pilot (~15,000 orders) that trained model v1. It is visible on the Model page as training data, not on the Overview.

**Today's orders arrive gradually.** Each day has a planned order count (2,000–5,000, slightly higher on weekends) and an intraday curve (quiet at night, peaks around lunch and evening). On every page load or **Refresh**, the server adds the orders that should have arrived by now. New orders appear only after a reload or Refresh.

**Midnight rollover.** After midnight IST, the next sync starts a new date. Any day missed while the app was closed is filled in completely, without a campaign.

**Order mix** (anchored to sourced numbers): ~57% COD; AOV centred near ₹1,074 (lognormal, ₹300–₹3,500); 55–65% of orders from repeat customers; ~44% of customers from Tier 3+ towns. Every order carries `batch_id` (its IST date), `placed_at` and `dispatch_deadline` (placed_at + 24 h). Paying online is only possible before dispatch.

**Customer response timing.**
- *Live campaigns (sent from the app):* message delivered within seconds; opens, clicks and online payments arrive over the next ~3 minutes, so the merchant can watch what happened to each order after a Refresh.
- *History:* realistic timings over hours.
- *Delivery outcomes* (delivered / returned / cancelled): 3–5 days after dispatch, in real time. History days older than ~5 days are fully resolved; recent days and today show "pending" until outcomes land.

**Hidden ground truth** (never visible to the model or the merchant): hidden customer types and return propensity, as in Appendix C. Message wording never changes the simulated response.

**Control group and test group.** Every campaign randomly keeps 10% of orders as a **control group** (no message) and 10% as a **random test** (a reminder or an offer at random), so the measured extra profit and the model's learning are unbiased.

---

## 4. Data model (Postgres)

Unchanged from v1 except:
- `order_batches`: + `planned_total`, `last_order_at`; one row per IST date.
- `system_settings`: the clock fields are now internal engine time (`sim_now` = real now during live sync; the historical time while seeding). No UI.
- Hard rules unchanged and enforced in the DB: a converted order can never be messaged again; a campaign takes only new eligible orders by default; control-group orders cannot be messaged; orders past dispatch are excluded.

Lifecycle: `new → eligible → in_run → decided → (holdout | message_drafted) → approved → sent → converted | not_converted → delivered | rto | cancelled`.

---

## 5. Pipeline (three separate steps, each writing its own table)

Unchanged from v1: **Score** (8 logistic regressions → `predictions`), **Decide** (pure, unit-tested EV function → `decisions`), **Draft** (LLM, batched, validated, template fallback → `messages`). The decision function passes the section 11 worked example.

---

## 6. Look and feel

- **Razorpay theme:** Inter; navy text `#192839`, slate `#40566D`, muted `#768EA7`; primary blue `#305EFF` (hover `#2950DA`), blue tint `#E9F0FF`; page `#F8FAFC`; borders `#DFE3E9`; success `#009E5C`; danger `#F0263C`. Navy sidebar.
- **Razorpay logo:** shown in the top bar and footer from `/public/razorpay-logo.svg` when the merchant adds the official file from Razorpay's brand kit; otherwise a "Razorpay" wordmark in brand blue.
- **Merchant brand:** "Dewlune" with its own original logo (crescent + dewdrop mark).
- Professional data-tool density: consistent card heights, 12–14 px UI text, tabular numbers.

**Navigation (left):** Overview · Orders · Model · Settings. The Inspector is a separate site reached from any order.

**Top bar:** merchant logo and name · "Updated 5:42 PM" + **Refresh** · campaign progress (when running) · notifications · role (Owner / Analyst) · concept label · Powered by Razorpay.

---

## 7. Pages

### 7.1 Overview (home, date-first)
- **Date pills** across the top for the last 30 days (today selected by default), with filters: range (7 / 14 / 30 days) and status (All · Campaign sent · Needs a campaign).
- **Day list:** one row per date (newest first) showing orders, COD orders, orders eligible, paid online after a message, extra profit vs control (or "pending"). Clicking a row (or a pill) **expands** that day:
  - Clickable tiles that open the Orders page pre-filtered, with a "Back to Overview" link: all orders · COD orders · eligible for a campaign · prepaid share · paid online after a message.
  - **COD cost at stake**, explained in plain words: "If these N orders stay cash on delivery, they cost you about ₹X more than if they were paid online: ₹A cash handling (N × ₹20) + ₹B extra returns (N × p% more returns × ₹400)."
  - **Campaign block:** "N orders are ready for a campaign · Run campaign" → progress (stage, %, ETA) → "Campaign ready · Review & send" → after sending, a live result strip (sent · opened · clicked · paid online · extra profit vs control).
  - **See more** opens the full day page.

### 7.2 Day page (`/day/<date>`) — "See more"
KPIs for the date; each campaign of the day with its decisions, results and the order-by-order table; links to the Orders page and the Inspector.

### 7.3 Campaign page (`/day/<date>/campaign/<id>`) — review, send, track
- Name: "Campaign · 11 Oct, 5:40 PM" (never "Run #1").
- What the AI decided: three cards — **No message · Reminder · ₹50 off offer** — each with the **number of orders**, the expected extra profit, a sample message and "View orders".
- Control group and random test shown separately, in plain words.
- Orders grid: order, customer, value, AI decision, why (expected extra profit), channel, message (click to edit; edits logged), status after sending (sent → opened → clicked → paid online / still COD → delivered / returned).
- **One button: Approve & send.** It opens a pop-up summary (orders to message, reminders vs offers, total discount exposure, WhatsApp vs mobile inbox split, control-group size). **Confirm** sends. No per-row approve/reject.
- After sending, the same page tracks what happened to each order (Refresh to update).
- Owner only can confirm; an Analyst sees "Request approval", which notifies the Owner.

### 7.4 Results inside the day and campaign views
Per campaign: funnel (sent · delivered · opened · clicked · paid online), expected extra profit, **extra profit vs control** per eligible order and in total ("pending" until delivery outcomes resolve), AI-picked vs control comparison for paid-online rate, cancellations and returns. Guardrails: order volume trend and cancellations vs control. Auto-pause if a campaign's measured extra profit turns clearly negative.

### 7.5 Orders (data explorer)
Every order in the database with filters (date, payment, eligibility, campaign group, status, used in training) and a by-day summary. Opened pre-filtered from Overview tiles with a back link. Each order links to the Inspector.

### 7.6 Model
- Active version, trained on, training rows; version history.
- **Daily diagnostics** for every campaign day: orders scored, AI mix (no message / reminder / offer), predicted vs actual paid-online rate, expected vs measured extra profit, AUC where outcomes allow.
- New randomised outcomes since last training (control + random test), "Retrain recommended" past 1,500.
- **Retrain** (progress shown) → candidate; accuracy side by side (AUC per model, predicted vs actual per action); **Promote** (Owner, confirmation, logged). Training rule stated: only randomised orders are used.

### 7.7 Settings
Merchant profile; integrations (simulated); economics; experiment (control %, max sends, min gap); audit log.

---

## 8. Decision Inspector (separate site)
Unchanged in content; plain labels. Order view: features as the model saw them, probabilities, five-outcome expected profit per action, why the chosen action won, LLM prompt/output/edits, events and outcome.

---

## 9. Learning loop
Outcomes resolve in real time. Train only on control + random-test outcomes plus the pilot. Retraining is merchant-triggered from the Model page.

---

## 10. Do not include
- Confidence scores on recommendations; a monthly discount budget; the model recommending configuration changes; cross-merchant data; decisions for first-time customers or high-return-risk orders; checkout-time intervention; SMS or channel optimisation; LLM wording changing outcomes; real sending or real customer data; named Razorpay products other than "Razorpay"; fixed rule buckets presented as the decision logic; real authentication; pg_cron / Edge Functions / Realtime; claims of real-world accuracy.
- **Removed in v2:** any simulated clock, Pause or Advance control in the UI; reset or re-seed controls inside the app.

---

## 11. Quality bar
- Decision function unit tests incl. the worked example (m ₹350, F ₹20, C ₹400, D ₹50, M ₹1 → EV ₹257.50 / ₹285.13 / ₹260.70, choose the reminder; the spec's ₹285.14 is matched within ±₹0.01).
- The DB rejects any send to a converted order (tested).
- No browser `alert` / `confirm`; every number traces to a stored value; works at laptop width.
- Plain language everywhere a merchant looks; internal terms only in the Inspector and code.

---

## 12. "Done" for the 90-second video
1. **Overview** — date pills; today's orders so far; click Refresh and new orders arrive; COD cost at stake in plain words. *(10 s)*
2. **Run campaign** from today's row — progress with stage and ETA; move to another page; "Campaign ready" notification. *(15 s)*
3. **Review & send** — three decision cards with order counts and expected extra profit; LLM drafts; edit one; **Approve & send** → pop-up → Confirm. *(20 s)*
4. **Inspector** — one order: why the reminder beat the offer, step by step. *(15 s)*
5. **Results** — Refresh: opens, clicks and online payments fill in; then open a past day to show extra profit vs control. *(15 s)*
6. **Model** — daily diagnostics; retrain; compare; promote. *(15 s)*

---

## 13. Build order
- **P0 (done, revised in v2):** schema + hard rules; real-time sync and 30-day history; Overview; campaign create → score → decide → draft with progress; review + one-click send; response simulation; results; Inspector.
- **P1:** Orders explorer; Model page (diagnostics, retrain, compare, promote); Settings; role gating with approval requests; audit log; auto-pause; resends.
- **P2:** Inspector run view; theming polish; dark mode; CSV export.

---

# Appendices
Appendices A–F from v1 still apply with these changes:
- **A (setup):** the full reset lives **outside the app** at `/admin/reset?token=<SETUP_TOKEN>` (bookmark it). It wipes and re-seeds everything (history + today) with a progress list.
- **B (defaults):** unchanged; there is no sim-clock speed.
- **C (simulation):** unchanged probabilities; customer categories updated for wellness & beauty.
- **E (LLM):** merchant name "Dewlune"; tone "Warm, calm and plain-spoken. Short sentences. Friendly, never pushy. No emojis."

## Appendix G: plain-language labels

| Internal | On screen |
| --- | --- |
| Run | Campaign (named by date and time) |
| Nudge | Reminder (no discount) |
| Discount | ₹50 off offer |
| None | No message |
| Model group | AI-picked |
| Holdout | Control group (no message) |
| Explore | Random test |
| Converted | Paid online |
| RTO | Returned (RTO) |
| Expected gain | Expected extra profit |
| Incremental ₹ per eligible order | Extra profit per order vs control |
