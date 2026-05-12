# Baseline Decision

Selected build base: the GitHub Next.js app from `ivanovroxana1988-arch/Raportare_PEO`.

Why this is the better foundation:

- It is already organized as a real app: `app/`, `components/`, `hooks/`, `lib/`, and `scripts/`.
- It has separate expert and PM dashboards instead of one large HTML file.
- It already had auth/data/storage integration patterns that could be migrated to AWS.
- It includes reusable UI components, document utilities, OPIS/report helpers, and AI API routes.
- It is easier to extend, test, deploy, and keep under version control.

What we keep from the HTML:

- The standalone file is preserved at `references/PEO_Pontaj_App_40.html`.
- Treat it as the v2.4 behavior reference for domain rules, activity catalogs, document checks, local export behavior, and exact wording.
- When a feature differs between the two, compare against the HTML before replacing behavior.

First build priorities:

1. Seed AWS data with the Concordia PEO 302141 expert list from the HTML.
2. Check which v2.4 HTML features are missing or weaker in the Next.js app.
3. Make local development reliable with `.env.local`, dependency install, and a successful Next build.
4. Polish the main workflows in this order: expert pontaj, livrabile/document checks, PM verification, report/export.
