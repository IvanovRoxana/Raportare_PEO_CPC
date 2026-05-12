# Raportare PEO

Working base for the PEO 302141 reporting app.

This folder starts from the GitHub Next.js version because it is the strongest foundation for continued development. The standalone HTML version is kept as a reference at:

`references/PEO_Pontaj_App_40.html`

## Setup

1. Copy `.env.example` to `.env.local`.
2. Run the Amplify sandbox/deploy flow so `amplify_outputs.json` exists.
3. Fill `OPENAI_API_KEY` if AI routes are enabled.
4. Install dependencies:

```bash
npm install
```

5. Start local development:

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
