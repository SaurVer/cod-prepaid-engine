# How AI was used to build PayShift

PayShift is a concept prototype for the Razorpay AI PM Build Challenge, Track 2. It decides, for each cash-on-delivery (COD) order from a repeat customer, whether to send nothing, a reminder, or a ₹50-off offer to move the customer to prepaid, and it measures the extra profit against a random control group. All data is synthetic.

- Live prototype: https://cod-prepaid-engine.vercel.app
- Code: https://github.com/SaurVer/cod-prepaid-engine
- Build spec: [`docs/cod-prepaid-prototype-spec.md`](./cod-prepaid-prototype-spec.md)

---

## 1. AI tools and models used

| Where | Tool / model | Used for |
| --- | --- | --- |
| Building the prototype | **Claude** (Anthropic), model `claude-opus-5-5`, working as a coding agent with a shell, Git, and connectors to Supabase, Vercel and GitHub | Writing the code, database migrations, seeding, deployment checks, debugging, and keeping the spec up to date |
| Inside the product | **Anthropic API**, model set by the `LLM_MODEL` environment variable (default `claude-haiku-5-5`) | Drafting the WhatsApp / app-inbox message for each order. Only the wording, never the decision |
| Inside the product | **No LLM**: 8 logistic regressions trained in TypeScript | Predicting the chance of paying online, cancelling and being returned under each action |
| Demo video | **Claude** | Home-page animation (HTML), voiceover script timed to the screen recording |
| Demo video | **ChatGPT** | Ideas for the video and drafts of the script |
| Demo video | **macOS text-to-speech** (`say`) | Narration |

The decision itself is plain arithmetic: expected profit for each of the three actions, pick the highest. It is deliberately not done by an LLM, so it can be unit-tested and explained.

---

## 2. Key prompts, workflows and agent setup

### Workflow

1. **I wrote the build spec first.** It covers the problem, the three actions, the control-group design, the profit formula, the pages and the "do not include" list. Every build session started from it, and the agent updated it after each change (v1 → v4.9, change notes at the top), so the spec always matches what is deployed.
2. **One agent session per round of changes.** I reviewed the live site, wrote feedback as a numbered list, and the agent made the changes, ran the type-check and tests, committed, pushed, and confirmed the Vercel deployment was ready.
3. **Deploy on every change.** GitHub → Vercel (Mumbai region, next to the Supabase database). Database changes went through numbered SQL migrations in `db/migrations/`.

### Standing instructions given to the build agent (from the opening prompt)

- "Use environment variables for all secrets. Never hardcode or commit keys."
- "Never use browser alert/confirm dialogs."
- "Do not use pg_cron, Supabase Edge Functions or Realtime."
- Keep **score → decide → draft** as three separate steps, each writing its own table.
- Hard rules (never message a converted order, never message the control group, nothing after dispatch) are **enforced in the database**, not only in the UI.
- Follow the spec, and ask when it is ambiguous.
- Later: keep the spec and the build in sync on every change, and keep token use low (small edits, no heavy QA unless needed).

### The in-product drafting prompt (abridged from `src/lib/core/llm.ts`)

> You write short prepaid-conversion messages for {merchant}, a D2C wellness brand. Tone: {tone}.
> The customer already placed a cash-on-delivery order. Your message invites them to pay online now with a one-tap link.
> Rules: max 300 characters; no false urgency or countdowns; no pressure; mention the discount only if one is given, with its exact amount; never mention data about the customer beyond what is provided; end with the placeholder {link}.
> Return JSON only: `{"text": "...", "variant_tag": "reminder" | "reassurance" | "offer"}`

Every draft is **validated in code** after it comes back: length, the link placeholder, and no discount mentioned in a plain reminder. If a draft fails validation, or the API is unavailable, a fixed template is used and the order is marked as a fallback. About 20 orders are drafted per API call.

---

## 3. AI output I rejected or corrected, and why

### The main one: "extra profit so far" showed a large loss that wasn't real

**What the AI built.** To show results before every delivery is known, the agent's first version computed extra profit vs control from whichever orders had resolved so far.

**What went wrong.** Recent campaigns showed big losses, e.g. **−₹58,547**, while older, fully measured campaigns were clearly profitable.

**Why it was wrong.** Cancellations are known the day after the order (at dispatch). Deliveries are known only 3–5 days later. In the first few days, the "resolved" orders are mostly cancellations, which earn ₹0. On top of that, the AI-decided group has slightly more cancellations, because a message prompts some people to cancel instead of paying. So an early average is biased downwards. The arithmetic was correct; the sample was not.

**What I decided.** A number that is wrong in a predictable direction is worse than no number.
- The estimate now uses profit per *shipped* order, scaled by the share not cancelled.
- It appears only once at least half of each group is resolved; before that, it says "Measuring · x% known".
- The final number appears only when every delivery is known.
- The explainer was rewritten in totals ("control orders earned ₹X in total, which is ₹Y per order…") so a non-technical merchant can follow the sum.

### Other outputs I pushed back on

- **Day calendar on the home page.** I found the agent's calendar grid harder to use than what it replaced, and asked for three dropdown filters instead (period, campaign status, go to a day).
- **Explanations written for an analyst.** Early "how is this calculated" text used terms like expected value and uplift. I rejected it twice until it read as plain sums, e.g. "Out of 100 orders like this one: 70 pay online and are delivered, ₹350 each…".
- **Checkout in the home-page animation.** The first versions looked like a generic payment page. I had it rebuilt against the real Razorpay checkout layout, and removed the step captions so the animation tells the story on its own.
- **Visible test mechanics.** Seeding past days needs campaigns to be run "as of" 9 PM on those days. I had every mention of this removed from the screens so the product feels like production, while the mechanics stay documented in the spec.

---

## 4. What AI did vs what I decided or built

| I decided / did | AI did |
| --- | --- |
| The problem and who it is for (repeat COD customers of D2C brands; first-time and high-return-risk orders excluded) | Wrote all the application code: Next.js app, database schema and migrations, simulation, model training, pipeline |
| The three actions, and that the decision is an expected-profit calculation, not an LLM call | Implemented the expected-profit function and its unit tests from my worked example |
| The proof design: random control group for measurement, separate random test group for training, the AI-decided group never used for training | Built the order simulation, the 30-day seeded history and the real-time order flow |
| The profit formula and cost inputs (margin, cash-handling fee, return cost, discount, message cost) | Wrote the LLM drafting step, its validation and the template fallback |
| Merchant stays in control: nothing is sent without review; orders and groups can be unticked | Applied database indexes and query rewrites when I flagged the site as slow |
| What goes on each screen, what is left out, and the plain-language wording standard | Debugged issues I reported (e.g. a just-started campaign not showing on its day card) |
| Every round of review on the live site, and what to reject | Kept the spec in sync with each change; built the home-page animation and the timed video script |

---

## 5. Known limitations, risks and verification

### Limitations

- **Synthetic data.** Customer behaviour comes from a simulation with hidden customer types. The model has never seen a real customer. The profit numbers show that the method works, not what a real merchant would earn.
- **Message wording has no effect on the simulated response.** This is by design, so the LLM cannot inflate results, but it also means the prototype cannot test which wording works better.
- **Simple model.** Logistic regressions on a handful of order and customer features. Good enough to rank actions; not tuned.
- **Results take days.** Delivery outcomes arrive 3–5 days after dispatch, as they would in reality, so recent campaigns show "Measuring" for a while.
- **Small campaigns are noisy.** With a 10% control group, a single day's extra profit can be negative even when the method works over many days. Several seeded days show small losses.
- **Single merchant, single user.** No authentication, roles or multi-tenant separation.

### Risks if this went live

- **Discount leakage.** Customers who learn that waiting brings an offer may start choosing COD on purpose. Mitigations: offers only to repeat customers, offers to a small share of orders, and the control group would show it as falling profit.
- **Message fatigue and consent.** Real sending needs WhatsApp template approval, opt-in records and frequency caps.
- **Over-trusting the model.** The merchant sees each decision and its sum, can exclude orders, and decides when to retrain. The model never changes its own settings.
- **LLM output risk.** The LLM only writes wording, and every draft is validated against fixed rules before it can be sent. It cannot change the action, the discount amount or who receives a message.

### How it was verified

- **Unit tests** (`npm test`, 13 passing): the decision function reproduces the spec's worked example (₹257.50 / ₹285.13 / ₹260.70, picks the reminder), plus simulation, model and LLM validation tests.
- **Database rules**: the database rejects any send to an order that has already paid online (tested). Control-group orders and orders past dispatch are also blocked at the database level, and a unit test checks that control-group orders always get no message.
- **Every number traces back to stored data.** The Decision Inspector shows, for any order, the inputs, the predicted chances, the sum for each action and why one was chosen.
- **Live-data checks with SQL**, e.g. when "Measuring · 11% known" looked stuck, a query against the live database showed how many deliveries were resolved and when the rest were due, which confirmed it was rising on schedule.
- **Manual review of every deployment** on the live site, screen by screen.
