# Raportare PEO

Working base for the PEO 302141 reporting app.

This folder starts from the GitHub Next.js version because it is the strongest foundation for continued development. The standalone HTML version is kept as a reference at:

`references/PEO_Pontaj_App_40.html`

## Setup

1. Copy `.env.example` to `.env.local`.
2. Run the Amplify sandbox/deploy flow so `amplify_outputs.json` exists.
3. Fill `OPENAI_API_KEY` if AI routes are enabled.
   - Local: set it only in `.env.local`.
   - Production: configure it in AWS Amplify Hosting Environment Variables / Secrets for the `main` branch.
   - Never expose it as a `NEXT_PUBLIC_*` variable, in `amplify_outputs.json`, or in public files.
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

## One-Command Deploy

The local deploy flow can run checks, commit/push to GitHub and start the Amplify Hosting job for `main`.

First-time or expired AWS SSO session:

```powershell
npm run aws:sso
```

The full deploy script also auto-configures the `raportarepeo` AWS SSO profile with:

- SSO start URL: `https://d-c367697fc4.awsapps.com/start`;
- account ID: `147885329053`;
- role: `AdministratorAccess`;
- region: `eu-north-1`.

Regular deploy with a commit:

```powershell
npm run deploy:full -- -CommitMessage "Describe the change"
```

What it does:

- runs `typecheck`, `lint`, `test` and `build`;
- commits local changes when `-CommitMessage` is provided;
- pulls with `--ff-only` and pushes `main` to GitHub;
- starts an Amplify `RELEASE` job for app `d19mquq8thd1uj`, branch `main`;
- waits for the Amplify job to finish.

Useful options:

```powershell
npm run deploy:full -- -SkipGit
npm run deploy:full -- -SkipChecks
npm run deploy:full -- -NoWait
```

Example smoke command for an existing AI endpoint:

```bash
curl -X POST http://localhost:3000/api/ai/generate-report \
  -H "Content-Type: application/json" \
  -d "{\"activities\":[{\"date\":\"2026-05-14\",\"hours\":1,\"activityType\":\"Test\",\"title\":\"Test\",\"description\":\"Test\"}],\"month\":\"Mai\",\"year\":2026,\"expertName\":\"Test Expert\"}"
```
