# Raportare PEO

Working base for the PEO 302141 reporting app.

This folder starts from the GitHub Next.js version because it is the strongest foundation for continued development. The standalone HTML version is kept as a reference at:

`references/PEO_Pontaj_App_40.html`

## Setup

1. Copy `.env.example` to `.env.local`.
2. Run the Amplify sandbox/deploy flow so `amplify_outputs.json` exists.
3. Fill `OPENAI_API_KEY` if AI routes are enabled.
4. Review the AI governance variables in `.env.example` before enabling AI in a funded/audited environment:
   `AI_AUDIT_LOG_PATH`, `AI_RATE_LIMIT_PER_MINUTE`, `AI_RATE_LIMIT_PER_DAY`,
   `AI_DAILY_COST_LIMIT_USD`, `AI_MONTHLY_COST_LIMIT_USD`, and model pricing overrides.
5. Install dependencies:

```bash
npm install
```

6. Start local development:

```bash
npm run dev
```

## Project Structure

- `app/` - Next.js pages and API routes.
- `components/` - Expert, PM, and UI components.
- `hooks/` - Data hooks for AWS-backed workflows.
- `lib/` - Domain constants, stores, document utilities, report helpers.
- `scripts/` - Local helper scripts.
- `references/` - Original source/reference files used when rebuilding features.

## Current Baseline

See `BASELINE_DECISION.md` for the comparison decision and first build priorities.

## Amplify SSR API Checks

The app is built for Amplify SSR/compute deployment. Keep the build artifact as `.next` and do not enable static export.

After `npm run build && npm start`, verify the Node.js API runtime locally:

```bash
curl http://localhost:3000/api/health
```

AI routes remain server-side only and require server environment variables such as `OPENAI_API_KEY` to be configured in Amplify Hosting, not exposed with `NEXT_PUBLIC_*`.

### Temporary deliverable eligibility suspension

Automatic deliverable eligibility checking is temporarily disabled until API keys are configured and the eligibility rules are fully validated. Manual PM review, upload, listing, status updates, observations and reporting history remain available.

Use these feature flags to control the automatic check:

```bash
NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK=false
ENABLE_DELIVERABLE_ELIGIBILITY_CHECK=false
```

Set both values to `true` to reactivate the UI action and the server endpoint later.

Example smoke command for an existing AI endpoint:

```bash
curl -X POST http://localhost:3000/api/ai/generate-report \
  -H "Content-Type: application/json" \
  -d "{\"activities\":[{\"date\":\"2026-05-14\",\"hours\":1,\"activityType\":\"Test\",\"title\":\"Test\",\"description\":\"Test\"}],\"month\":\"Mai\",\"year\":2026,\"expertName\":\"Test Expert\"}"
```
