# Build spec: PayShift · COD-to-Prepaid Decision Engine (prototype) · v3

Concept prototype for the Razorpay AI PM Build Challenge, Track 2 ("Recover and Grow with AI"). Built on synthetic data. Every screen shows a small "Concept prototype · synthetic data" label.

Deadline: submission due 13 Oct 2026, 11:59 PM IST. **A working core loop beats a half-built everything.** Visible behaviour should feel like a real product; plumbing stays simple.

The part to protect at all costs:
**live order flow → real model → real EV calculation → real LLM draft → merchant approval → simulated customer response → randomised control group → measured extra profit → Inspector explanation → retraining.**

> **What changed in v3** (second merchant review):
> 1. **Past days have orders but no campaigns.** You run them yourself. A campaign on a past day is a **replay**: it is treated as sent at 9 PM that evening, and when you send it, customer responses, shipping and deliveries up to now are filled in at once, so the result shows immediately (fully measured for days older than ~5 days).
> 2. **Product name and hero.** The tool is called **PayShift** ("COD → Prepaid"). The Overview opens with a hero mast that says what it does and the four steps.
> 3. **New merchant:** "Elvora" (Skin · Hair · Wellness) with a new original logo, replacing "Dewlune". Order codes start `EV-`.
> 4. **Campaigns section** in the left nav: a list of every campaign (past and today) and a dedicated campaign window for review, send and results. The Overview links into it; review and sending no longer happen inside the Overview.
> 5. **Control group and random test, explained** wherever they appear: what each group gets and what it is used for (control: measure profit *and* train; random test: train only; AI-decided: the result, never used to train).
> 6. **Choose the sizes per campaign.** The Run campaign dialog has Control group % (1–50) and Random test % (0–50, 0 skips it); defaults live in Settings.
> 7. **"Extra profit vs control" is explained** with the formula and, for each measured campaign, the filled-in numbers.
> 8. **Model page rebuilt** with tabs: Summary · Training data (how much there is, what it looks like, sample rows) · Parameters (weights of the 8 models, input scaling, training settings) · Run outputs (per campaign, opening a page with every order's predictions, expected profit per action and decision, plus a worked example) · Accuracy.
> 9. **Speed and polish:** pages no longer sync on every load (the Overview syncs at most every 30 s; Refresh forces it); the Overview switches days, ranges and filters in the browser; loading skeletons; Refresh lives only on the Overview; custom date range; an expanded day row looks clearly different from collapsed rows; the self-referencing "See more" link is gone.

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
- Product: **PayShift** (a Razorpay concept; the name is used only inside this prototype).
- Merchant: one fictional wellness & beauty D2C brand, **"Elvora"** (skincare, haircare, supplements). Never use a real brand.
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
| Live order flow | **Real-time sync on the Overview and on Refresh** | Opening the Overview (at most every 30 s) or clicking Refresh tops today's orders up to what should have arrived by now and resolves anything due. Other pages read only. No cron. |
| Campaign processing | Chunked API calls (~200 orders per call) | A tracker in the app shell keeps calling the next chunk while the user moves around, so progress % and ETA are real. |
| Notifications | `notifications` table + light polling | Toast + bell for "campaign ready". |
| LLM | Anthropic API, model from env `LLM_MODEL` | Message drafting only. |
| Hosting | Vercel (functions in Mumbai, next to the database) | |

Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `SETUP_TOKEN`. Environment variables only; commit `.env.example` only.

---

## 3. Time model and data flow (replaces the simulated clock)

**Real dates, Indian time (IST).** The dashboard always works on the real calendar. There is no "sim time", no Pause and no Advance.

**History (seeded).** Setup creates the **last 30 days** of the store:
- Days −29 … −1: full order days with **no campaigns**. Orders, self-switches to prepaid, cancellations, shipping and deliveries all happened as they would without any messages.
- Today (day 0): orders keep arriving through the day. No campaign.
- **Running a campaign on a past day (replay).** It takes that day's eligible orders placed before 9 PM IST that were never in a campaign and had not already paid online (a conversion can never be undone). Those orders are put back to how they were at 9 PM (not shipped, no outcome; customer history rolled back), the hard rules are checked at 9 PM that day, and they wait while the campaign is prepared. On send, messages count as sent at 9 PM that evening and the store is played forward to now: responses (realistic hours), conversions before dispatch, shipping, and delivery outcomes up to today. Drafts use the live LLM like any campaign. A day can be replayed once; then it shows as sent.
- Before the 30 days: a 30-day randomised pilot (~15,000 orders) that trained model v1. It is visible on the Model page as training data, not on the Overview.

**Today's orders arrive gradually.** Each day has a planned order count (2,000–5,000, slightly higher on weekends) and an intraday curve (quiet at night, peaks around lunch and evening). On every page load or **Refresh**, the server adds the orders that should have arrived by now. New orders appear only after a reload or Refresh.

**Midnight rollover.** After midnight IST, the next sync starts a new date. Any day missed while the app was closed is filled in completely, without a campaign (it can be replayed like any past day).

**Order mix** (anchored to sourced numbers): ~57% COD; AOV centred near ₹1,074 (lognormal, ₹300–₹3,500); 55–65% of orders from repeat customers; ~44% of customers from Tier 3+ towns. Every order carries `batch_id` (its IST date), `placed_at` and `dispatch_deadline` (placed_at + 24 h). Paying online is only possible before dispatch.

**Customer response timing.**
- *Live campaigns (sent from the app):* message delivered within seconds; opens, clicks and online payments arrive over the next ~3 minutes, so the merchant can watch what happened to each order after a Refresh.
- *Replays of past days:* realistic timings over hours, already played forward to now when you send.
- *Delivery outcomes* (delivered / returned / cancelled): 3–5 days after dispatch, in real time. History days older than ~5 days are fully resolved; recent days and today show "pending" until outcomes land.

**Hidden ground truth** (never visible to the model or the merchant): hidden customer types and return propensity, as in Appendix C. Message wording never changes the simulated response.

**Control group and random test.** Before the AI decides, every campaign sets aside orders at random:
- **Control group** (default 10%, 1–50%): gets no message. *Used to measure* — its profit per order is the baseline for "extra profit vs control" — *and to train* (how customers behave with no message).
- **Random test** (default 10%, 0–50%; 0 skips it): gets a reminder or the offer, chosen at random. *Used to train* only: unbiased examples of how customers respond to each message.
- **AI-decided** (the rest): gets the action with the highest expected profit. *Used for the result*, compared with control. Never used for training.
The sizes are chosen in the Run campaign dialog (defaults in Settings; control + random test ≤ 60%) and frozen on the campaign.

**Extra profit vs control** = (average profit per order, AI-decided − average profit per order, control) × number of AI-decided orders. Profit per order is what the order actually earned once its delivery is known: delivered on COD = margin − cash fee; paid online and delivered = margin − discount; returned = −RTO cost; cancelled = ₹0; minus message cost. Shown as "Measuring · x%" until every AI-decided and control order has an outcome. Random-test orders are excluded.

---

## 4. Data model (Postgres)

Unchanged from v1 except:
- `order_batches`: + `planned_total`, `last_order_at`; one row per IST date.
- `system_settings`: the clock fields are now internal engine time (`sim_now` = real now during live sync; the historical time while seeding; 9 PM of the replayed day while a replay's orders enter the campaign). No UI. `exploration_pct` is the default random-test size.
- `runs.settings_snapshot` (v3): + `replay`, `campaign_at` (when the messages count as sent), `date`, and the per-campaign `holdout_pct` / `exploration_pct`.
- Hard rules unchanged and enforced in the DB: a converted order can never be messaged again; a campaign takes only new eligible orders by default; control-group orders cannot be messaged; orders past dispatch are excluded.

Lifecycle: `new → eligible → in_run → decided → (holdout | message_drafted) → approved → sent → converted | not_converted → delivered | rto | cancelled`.

---

## 5. Pipeline (three separate steps, each writing its own table)

Unchanged from v1: **Score** (8 logistic regressions → `predictions`), **Decide** (pure, unit-tested EV function → `decisions`), **Draft** (LLM, batched, validated, template fallback → `messages`). The decision function passes the section 11 worked example.

---

## 6. Look and feel

- **Razorpay theme:** Inter; navy text `#192839`, slate `#40566D`, muted `#768EA7`; primary blue `#305EFF` (hover `#2950DA`), blue tint `#E9F0FF`; page `#F8FAFC`; borders `#DFE3E9`; success `#009E5C`; danger `#F0263C`. Navy sidebar.
- **Razorpay logo:** shown in the top bar and footer from `/public/razorpay-logo.svg` when the merchant adds the official file from Razorpay's brand kit; otherwise a "Razorpay" wordmark in brand blue.
- **Merchant brand:** "Elvora" with its own original logo (gold leaf on a deep-green tile).
- **Product brand:** "PayShift" with an original mark (two arrows on a blue tile) in the top bar and hero.
- Professional data-tool density: consistent card heights, 12–14 px UI text, tabular numbers.

**Navigation (left):** Overview · Campaigns · Orders · Model · Settings. The Inspector is a separate site reached from any order.

**Top bar:** PayShift mark and name · campaign progress (when running) · concept label · notifications · role (Owner / Analyst). **Refresh** ("Updated 5:42 PM") is on the Overview only. Footer: Powered by Razorpay.

**Loading:** every page shows a skeleton immediately while its data loads.

---

## 7. Pages

### 7.1 Overview (home, date-first)
- **Hero mast:** "PayShift · COD → Prepaid for Elvora", a one-line promise ("Turn cash-on-delivery orders into prepaid, only where it pays."), a two-sentence description, the four steps (Pick a day → AI scores & decides → You review & send → Measure vs control), **Refresh** and a link to how the AI decides.
- **Filters:** range 7 / 14 / 30 days or **Custom** (from–to date pickers within the last 30 days); status All · Campaign sent · Not run yet. **Date pills** for the days that match (today open by default). All switching happens in the browser, instantly; the URL keeps the state.
- **At a glance** for the range: COD orders, orders messaged, paid online after a message (each opens Orders filtered to the range), **extra profit vs control** with a "How?" toggle that shows the formula. Orders-per-day chart.
- **Day list:** one row per date: orders, COD, eligible, campaign status (Ready for a campaign · Not run yet · Campaign running · Ready to review · Campaign sent / Replayed & sent · Orders arriving), paid online after a message, extra profit vs control (or "Measuring · x%"). Clicking a row or pill **expands** that day; the expanded day is visibly different (blue band, accent bar, raised card, highlighted chevron):
  - Clickable tiles that open the Orders page pre-filtered, with a Back link.
  - **COD cost at stake** in plain words.
  - **Campaign block:** "N orders are ready" (today) or "N orders can be replayed" (past day, with the 9 PM explanation) → **Run campaign** dialog → the campaign window opens. While running: progress here and in the top bar. When ready: "Review & send →" opens the campaign window. After sending: a result strip with the extra-profit equation filled in, and "View results →".

### 7.2 Campaigns (`/campaigns`)
Every campaign ever run, newest first: name ("Campaign · 3 Oct, 9:00 PM"), order day, Live or Replay, status, orders, control (n · %), random test (n · %), AI-decided, messages sent, paid online, expected extra profit, extra profit vs control. Totals on top. Old `/day/...` links redirect here or to the Overview.

### 7.3 Campaign window (`/campaigns/<id>`) — review, send, track
- Name, status, "Replay of 3 Oct, 9 PM" badge when it is a replay; order day, model version, control % and random test %.
- What the AI decided: three cards — **No message · Reminder · ₹50 off offer** — with order counts, expected extra profit, a sample message and "View orders".
- **Who got what, and why:** control group, random test and AI-decided with counts, what each got and what each is used for (measure / train / result).
- Orders grid (edit messages before sending; edits logged).
- **Approve & send** → pop-up summary (and, for a replay, a note that it counts as sent at 9 PM and is played forward) → **Confirm**. Owner only; an Analyst sees "Request approval".
- After sending: funnel tiles, AI-decided vs control chart, and **How the extra profit is measured** with the filled-in equation. Link to the campaign's **Model outputs**.

### 7.4 Results
Per campaign: funnel (sent · delivered · opened · clicked · paid online), expected extra profit, extra profit vs control (total and per order; "Measuring" until delivery outcomes resolve), AI-decided vs control comparison for paid-online rate, cancellations and returns.

### 7.5 Orders (data explorer)
Every order in the database with filters (date, payment, eligibility, campaign group, status, used in training) and a by-day summary. Opened pre-filtered from Overview tiles with a back link. Each order links to the Inspector.

### 7.6 Model (tabs)
- **Top tiles:** active model; **training data available** (randomised orders with a known outcome: pilot · control · random test); new since last training ("Retrain recommended" past 1,500); what it predicts (12 chances per order from 8 small models). **Retrain** (progress shown) in the header.
- **Summary:** how the AI decides (predict → price each action → pick), the training rule, version history.
- **Training data:** counts by source; a table by source × action (orders, outcome known, paid-online %, cancelled %, returned % of shipped, not yet used); 15 sample rows exactly as the model sees them (inputs and labels); which rows each of the 8 models learns from.
- **Parameters:** a weight table for the active model (inputs × the 8 models, colour-coded, plus intercepts), input scaling (average and spread) and training settings (iterations, learning rate, L2, split).
- **Run outputs:** predicted vs actual paid-online chart; one row per sent campaign (order day, model, mix, messaged, predicted vs actual, AUC, expected extra profit). Clicking a day opens **`/model/runs/<id>`**: average predictions per action, a **worked example** (five outcomes × chance × profit for each action, gain vs no message), and every order's P / K / Rc / Rp, expected profit per action and decision, filterable by group and action, paginated.
- **Accuracy:** active vs new model (AUC per model, predicted vs actual per action on held-out recent orders) and **Promote** (Owner, confirmation, logged).

### 7.7 Settings
Merchant profile; integrations (simulated); economics; experiment defaults (**control group %**, **random test %**, max sends, min gap) with the control / random test explainer; audit log.

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
- **Removed in v3:** pre-run campaigns in the seeded history; the separate day page; a Refresh button on every page.

---

## 11. Quality bar
- Decision function unit tests incl. the worked example (m ₹350, F ₹20, C ₹400, D ₹50, M ₹1 → EV ₹257.50 / ₹285.13 / ₹260.70, choose the reminder; the spec's ₹285.14 is matched within ±₹0.01).
- The DB rejects any send to a converted order (tested).
- No browser `alert` / `confirm`; every number traces to a stored value; works at laptop width.
- Plain language everywhere a merchant looks; internal terms only in the Inspector and code.

---

## 12. "Done" for the 90-second video
1. **Overview** — hero says what PayShift does; Refresh pulls new orders; open a past day: COD cost at stake. *(10 s)*
2. **Run campaign** on a past day — dialog with control % and random test %, explained; progress with stage and ETA; "Campaign ready" notification. *(15 s)*
3. **Review & send** in the campaign window — three decision cards; LLM drafts; edit one; **Approve & send** → pop-up → Confirm. Results appear at once: paid online, and extra profit vs control with its equation. *(25 s)*
4. **Inspector** — one order: why the reminder beat the offer, step by step. *(10 s)*
5. **Today** — run today's campaign; watch opens, clicks and payments arrive within minutes. *(15 s)*
6. **Model** — training data available; parameters; a run's outputs; retrain; compare; promote. *(15 s)*

---

## 13. Build order
- **P0 (done, revised in v2):** schema + hard rules; real-time sync and 30-day history; Overview; campaign create → score → decide → draft with progress; review + one-click send; response simulation; results; Inspector.
- **P1:** Orders explorer; Model page (diagnostics, retrain, compare, promote); Settings; role gating with approval requests; audit log; auto-pause; resends.
- **P2:** Inspector run view; theming polish; dark mode; CSV export.

---

# Appendices
Appendices A–F from v1 still apply with these changes:
- **A (setup):** the full reset lives **outside the app** at `/admin/reset?token=<SETUP_TOKEN>` (bookmark it). It wipes and re-seeds everything (pilot, model v1, 29 past days of orders without campaigns, today so far) with a progress list.
- **B (defaults):** unchanged; there is no sim-clock speed.
- **C (simulation):** unchanged probabilities; customer categories updated for wellness & beauty.
- **E (LLM):** merchant name "Elvora"; tone "Warm, calm and plain-spoken. Short sentences. Friendly, never pushy. No emojis."

## Appendix G: plain-language labels

| Internal | On screen |
| --- | --- |
| Run | Campaign (named by date and time) |
| Nudge | Reminder (no discount) |
| Discount | ₹50 off offer |
| None | No message |
| Model group | AI-decided |
| Holdout | Control group (no message) |
| Explore | Random test |
| Converted | Paid online |
| RTO | Returned (RTO) |
| Expected gain | Expected extra profit |
| Incremental ₹ per eligible order | Extra profit per order vs control |
| Replay (run on a past day) | Replay of <date>, 9 PM |
