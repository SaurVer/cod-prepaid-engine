# COD-to-Prepaid Decision Engine (concept prototype)

Razorpay AI PM Build Challenge · Track 2. **Concept prototype on synthetic data.** Fictional merchant: Verdant Daily.

Full setup, reset-demo steps and the video click path are added at the end of the build.

## Quick start

```bash
cp .env.example .env.local   # fill DATABASE_URL, ANTHROPIC_API_KEY, LLM_MODEL, SETUP_TOKEN
npm install
npm run db:migrate           # applies db/migrations
npm run dev                  # open http://localhost:3000 and click "Set up demo data"
npm test                     # unit tests (decision function, simulation, model, LLM validation)
```
