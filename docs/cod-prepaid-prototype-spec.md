# Build spec: PayShift · COD-to-Prepaid Decision Engine (prototype) · v4

Concept prototype for the Razorpay AI PM Build Challenge, Track 2 ("Recover and Grow with AI"). Built on synthetic data. Every screen shows a small "Concept prototype · synthetic data" label.

Deadline: submission due 13 Oct 2026, 11:59 PM IST. **A working core loop beats a half-built everything.** Visible behaviour should feel like a real product; plumbing stays simple.

The part to protect at all costs:
**live order flow → real model → real EV calculation → real LLM draft → merchant approval → simulated customer response → randomised control group → measured extra profit → Inspector explanation → retraining.**

> **v4.9** — A campaign shows its progress on its day card and the banner the moment it starts: the Overview merges the live list of running campaigns (each now carries its day) into the day data, so no second click is needed.
> **v4.8** — Production feel: no notes about past days anywhere (run dialog, Approve & send pop-up, day panel, results). Speed: per-day Overview counts aggregate the orders once from a covering index (≈ 0.5 s → 0.2 s on the database), campaign stats run their queries in parallel, larger DB connection pool (migration 0004_speed).

> **v4.7** — Overview top: one light card, 420 px tall, in the razorpay.com style (white with a soft blue gradient, navy headings, Razorpay blue accents). Left: banner with the PayShift mark and name, “Powered by Razorpay” (official logo when /public/razorpay-logo.svg is present), “COD in. Prepaid out.”, one sentence on what PayShift does, and today's numbers (orders, COD, ready, at stake) with Run today's campaign / Open today. Right (300 px): the customer-journey animation, on a transparent background (public/payshift-hero.html, self-contained HTML in an iframe): lock screen → WhatsApp notification → chat with the persuasive message → Razorpay Checkout (layout matched to the live checkout: blue top with merchant logo, “Razorpay Trusted Business”, Total Amount, social-proof strip, white sheet with UPI options, dark Pay button, “Secured by Razorpay”) → paid → confirmation in WhatsApp.

> **v4.6** — The word "replay" is not shown anywhere on screen: a campaign on a past day simply says its messages go out at 9 PM that day (the mechanics are unchanged). Orders page: **From / To date filter** next to the single-day filter (choosing one clears the other).

> **v4.5** — Seeded history now has **campaigns on the oldest 23 days** (replayed at 9 PM with the fixed templates, control 10% / random test 10%, sent and fully played forward), and the **latest 7 days including today are left for the demo**. The "so far" estimate no longer over-counts cancellations (they are known at dispatch while deliveries trickle in): it uses the value of shipped orders known so far × the share not cancelled − message cost, and appears only once half of each group's deliveries are known. Single days can still come out negative because the control group is small; the 23-day total is clearly positive (≈ ₹2.5 lakh in a test seed).

> **v4.4** — Extra profit vs control updates while a campaign is measuring: once each group has 20 known deliveries it shows an estimate marked “so far” (tile, day row, campaign strip), and the final number when every delivery is known. The explainer now works in totals, not averages: (1) control orders earned ₹X in total → ₹ per order; (2) without messages the AI's N orders would have earned N × that; (3) what they actually earned; extra profit = (3) − (2).

> **v4.3** — Campaign window, before sending: a **Send** checkbox on every drafted order, and two group toggles above the table (“AI-decided · 640 of 650”, “Random test · 98 of 100”) that tick or untick a whole group at once; unticked orders are kept but not sent (the Approve & send summary reflects it). Control-group orders never get a message. The orders table also shows the **order date and time**.

> **v4.2** — The "How?" explainer for extra profit vs control is rewritten for a layman: a medicine-trial analogy; three steps (split the orders at random → wait for the deliveries → compare what each order earned); a worked example using your most recent measured campaign ("Orders that got the AI's message earned ₹272 each; orders that got nothing earned ₹251; so each message added ₹21 × 739 orders = ₹15,677"), or clearly labelled made-up numbers if none is measured yet; what one order "earns" in plain words; and why we don't just count who paid online.

> **v4.1** — The days calendar is replaced by a single **filter bar of dropdowns**: Period (Last 7 / 14 / 30 days / Custom range with from–to), Campaign status (All days / Campaign sent / Not run yet) and **Go to a day** (every one of the last 30 days, labelled with its status and extra profit). Totals and the orders-per-day chart sit below it, then the day list.

> **What changed in v4** (third merchant review):
> 1. **Model page rebuilt around two questions.** (a) *Is it time to retrain?* — new learning examples since the last training, progress to the 1,500 threshold, how many more are waiting for deliveries, the model in use, Retrain, and a plain old-vs-new comparison with "Switch to vN". (b) *What did the model predict?* — one row per campaign, opening every order's chances and expected profit with plain column names ("Chance the customer pays online · Send nothing / Reminder / ₹50 offer"). Training data, parameters and accuracy move to a "Technical details" page for data teams.
> 2. **Calculations in plain words.** Expected profit is shown as "Out of 100 orders like this one: 25 pay online and are delivered, ₹300 each…" with totals, on the Inspector and on each campaign's predictions page. One sentence says why the AI chose what it did.
> 3. **Results after sending** are a plain table instead of a chart: AI-decided vs control (sent nothing), per 100 orders — paid online, cancelled, returned, profit per order — with the difference and a one-line verdict ("The campaign earned ₹X more than sending nothing would have").
> 4. **Overview:** the marketing-style hero is replaced by a normal page header and a "Today so far" strip with the next action; date pills are replaced by a **calendar of the last 30 days** (each day shows Not run / Ready / Review / Running / the extra profit); no day opens by itself on landing; the opened day, range and filter are kept when you leave and come back.
> 5. **Running a campaign keeps you on the Overview**: progress shows in the day and the top bar; a toast links to the campaign.
> 6. **Inspector** opens in the same tab with a Back link (no new tab); its layout no longer overlaps.

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
- Days −29 … −7: full order days, each with a campaign sent at 9 PM (fixed templates, no LLM). Days −6 … −1: full order days with **no campaigns**, for the demo. Orders, self-switches to prepaid, cancellations, shipping and deliveries all happened as they would without any messages.
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
- **Product brand:** "PayShift" with an original mark (two arrows on a blue tile) in the top bar.
- Professional data-tool density: consistent card heights, 12–14 px UI text, tabular numbers.

**Navigation (left):** Overview · Campaigns · Orders · Model · Settings. The Inspector is a separate site reached from any order.

**Top bar:** PayShift mark and name · campaign progress (when running) · concept label · notifications · role (Owner / Analyst). **Refresh** ("Updated 5:42 PM") is on the Overview only. Footer: Powered by Razorpay.

**Loading:** every page shows a skeleton immediately while its data loads.

---

## 7. Pages

### 7.1 Overview (home, date-first)
- **Header:** "Overview", one line on what the page is, **Refresh** ("Updated 5:42 PM"). No marketing hero; the product name lives in the top bar.
- **Today so far:** orders, COD orders, orders ready for a campaign, COD cost at stake, and the next action (Run today's campaign · Campaign running · Review & send), plus "Open today".
- **Filter bar** (dropdowns): **Period** — Last 7 / 14 / 30 days or Custom range (from–to date pickers within the last 30 days); **Campaign status** — All days / Campaign sent / Not run yet; **Go to a day** — any of the last 30 days, each labelled with its status ("Not run yet", "Campaign sent", "Ready to review"…) and extra profit when measured; choosing one widens the period if needed, opens that day in the list and scrolls to it. A count shows how many days are listed.
- **Totals for the period:** COD orders, orders messaged, paid online after a message (each opens Orders filtered to the period), extra profit vs control with a "How?" explainer ("How we know a campaign made you money", see v4.2); orders-per-day chart.
- **Day by day** list for the period and status chosen. **No day is open on landing.** The expanded day is visibly different (blue band, accent bar, raised card). Expanded day: clickable tiles, COD cost at stake, campaign block (Run campaign → progress → Review & send → result strip with the filled-in equation).
- **State is kept:** the open day, range and filter are in the URL and remembered for the browser session, so leaving for a campaign and coming back reopens the same day.
- **Run campaign** opens the dialog (control % and random test %), starts the campaign and **stays on the Overview**; a toast links to the campaign window.

### 7.2 Campaigns (`/campaigns`)
Every campaign ever run, newest first: name ("Campaign · 3 Oct, 9:00 PM"), order day, Live or Replay, status, orders, control (n · %), random test (n · %), AI-decided, messages sent, paid online, expected extra profit, extra profit vs control. Totals on top. Old `/day/...` links redirect here or to the Overview.

### 7.3 Campaign window (`/campaigns/<id>`) — review, send, track
- Name, status, "Replay of 3 Oct, 9 PM" badge when it is a replay; order day, model version, control % and random test %.
- What the AI decided: three cards — **No message · Reminder · ₹50 off offer** — with order counts, expected extra profit, a sample message and "View orders".
- **Who got what, and why:** control group, random test and AI-decided with counts, what each got and what each is used for (measure / train / result).
- Orders grid (edit messages before sending; edits logged).
- **Approve & send** → pop-up summary (and, for a replay, a note that it counts as sent at 9 PM and is played forward) → **Confirm**. Owner only; an Analyst sees "Request approval".
- After sending: funnel tiles and **Did the messages pay off?** — a table of AI-decided vs control group (sent nothing), per 100 orders: paid online, cancelled before shipping, returned (of shipped orders with a known outcome), profit per order, with the difference; then one verdict line ("The campaign earned ₹X more / less than sending nothing would have = (₹A − ₹B) × N orders", or "Still measuring: deliveries known for x of y"); then how profit per order is counted. Link to the campaign's **Model outputs**.

### 7.4 Results
Per campaign: funnel (sent · delivered · opened · clicked · paid online), expected extra profit, extra profit vs control (total and per order; "Measuring" until delivery outcomes resolve), AI-decided vs control comparison for paid-online rate, cancellations and returns.

### 7.5 Orders (data explorer)
Every order in the database with filters (date, payment, eligibility, campaign group, status, used in training) and a by-day summary. Opened pre-filtered from Overview tiles with a back link. Each order links to the Inspector.

### 7.6 Model
Two parts, in merchant language:
1. **Keeping the model up to date.** "N new learning examples since the model was last trained", a progress bar to 1,500 ("Retrain recommended" when reached), how many more are waiting for deliveries, and what a learning example is (a control-group or random-test order whose delivery is known; the model learns only from orders the AI did not choose for). Right side: the model in use (version, trained when, on how many examples) and **Retrain**. When a new version is trained: "On recent orders neither model learned from, the predicted share paying online was off by x pts (current) and y pts (new). Smaller is better." → **Switch to vN** (Owner, confirmation, logged).
2. **What the model predicted in each campaign.** One row per campaign (ready or sent): orders scored, how many the AI sent nothing / a reminder / the offer, expected vs actual share paying online. Each opens **`/model/runs/<id>`**: four tiles (orders scored; for each choice the average chance of paying online and profit per order), **one order worked through** ("Out of 100 orders like this one…" for each choice, plus a one-sentence reason), and a table of every order with plain column groups — *Chance the customer pays online* (Send nothing · Reminder · ₹50 offer), *Chance the customer cancels* (same), *Chance the order is returned* (If paid cash · If paid online), *Expected profit per order* (same three, best in green), *AI's choice*, *What happened* — filterable by group and choice, paginated.

**Technical details** (`/model/details`, linked from the header, for data teams): training data by source and action with sample rows, the 8 models' weights and input scaling, and accuracy (AUC, predicted vs actual on held-out orders).

### 7.7 Settings
Merchant profile; integrations (simulated); economics; experiment defaults (**control group %**, **random test %**, max sends, min gap) with the control / random test explainer; audit log.

---

## 8. Decision Inspector (separate site)
Own layout, opened **in the same tab** from "Why? →" on any order, with **← Back** to where you came from. In plain words: (1) what we knew about the customer; (2) what the AI predicted — "Chance that… the customer pays online / cancels / the order is returned if paid in cash / if paid online" for each choice, in %; (3) what each choice is worth — "Out of 100 orders like this one" per choice, with each outcome's count, profit each and total, message cost, profit per order and the difference vs sending nothing; how the AI picks; (4) the message (prompt and raw output behind a toggle); (5) what happened, as a timeline. A one-sentence "Why reminder?" at the top.

---

## 9. Learning loop
Outcomes resolve in real time. Train only on control + random-test outcomes plus the pilot. Retraining is merchant-triggered from the Model page.

---

## 10. Do not include
- Confidence scores on recommendations; a monthly discount budget; the model recommending configuration changes; cross-merchant data; decisions for first-time customers or high-return-risk orders; checkout-time intervention; SMS or channel optimisation; LLM wording changing outcomes; real sending or real customer data; named Razorpay products other than "Razorpay"; fixed rule buckets presented as the decision logic; real authentication; pg_cron / Edge Functions / Realtime; claims of real-world accuracy.
- **Removed in v2:** any simulated clock, Pause or Advance control in the UI; reset or re-seed controls inside the app.
- **Removed in v4:** the Overview hero; date pills; the days calendar (v4.1, replaced by dropdown filters); the chart of AI-decided vs control; Summary / Parameters / Accuracy tabs on the main Model page (moved to Technical details); opening the Inspector in a new tab; automatic jump to the campaign after Run campaign; auto-opening today's row.
- **Removed in v3:** pre-run campaigns in the seeded history; the separate day page; a Refresh button on every page.

---

## 11. Quality bar
- Decision function unit tests incl. the worked example (m ₹350, F ₹20, C ₹400, D ₹50, M ₹1 → EV ₹257.50 / ₹285.13 / ₹260.70, choose the reminder; the spec's ₹285.14 is matched within ±₹0.01).
- The DB rejects any send to a converted order (tested).
- No browser `alert` / `confirm`; every number traces to a stored value; works at laptop width.
- Plain language everywhere a merchant looks; internal terms only in the Inspector and code.

---

## 12. "Done" for the 90-second video
1. **Overview** — Today strip; "Go to a day" dropdown → a past day (e.g. 10 days ago): COD cost at stake. *(10 s)*
2. **Run campaign** — dialog with control % and random test %; stay on the Overview while it runs; "Campaign ready" notification. *(15 s)*
3. **Review & send** in the campaign window — three decision cards; edit a message; **Approve & send** → pop-up → Confirm → "Did the messages pay off?" table and verdict. *(25 s)*
4. **Why? →** on an order — Inspector: "out of 100 orders like this one", why the reminder beat the offer; Back. *(15 s)*
5. **Model** — new learning examples and the retrain recommendation; open the campaign's predictions; one order worked through. *(15 s)*
6. **Today** — run today's campaign; responses arrive within minutes. *(10 s)*

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
