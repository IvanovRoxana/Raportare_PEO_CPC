# Deferred Branches

## origin/codex/fix-lint-typecheck-build

Status: keep for later procurement development.

Audit date: 2026-09-02.

Reason:
- Do not merge directly. The branch mixes an old `activity-form` refactor with a separate procurement offer evaluation workflow.
- The `activity-form` refactor is stale compared with `main`, which now has newer delete, shared activity, duplicate handling, GDPR/GT, and authenticated upload logic.
- `main` already has the core procurement module: projects, documents, launches, suppliers, offers, evaluations, contracts, receptions, invoices, status history, and checklist.
- The branch still contains potentially useful procurement evaluation work that is not in `main`: offer package import, document classification, text/OCR extraction, signature validation, expert-course mapping, scoring, export, and AI review routes.

Later extraction notes:
- Extract procurement evaluation into a fresh branch instead of merging this branch.
- Adapt storage upload to the current authenticated upload helper.
- Reuse the current PDF worker/text extraction approach from `main`.
- Align procurement AI routes with the current AI governance, feature flags, timeouts, and token limits.
- Reconcile the additional Amplify models with the existing procurement schema before deploying.

## origin/codex/procurement-offer-evaluation

Status: keep for later PM/procurement development.

Audit date: 2026-09-02.

Reason:
- This is the real candidate for selective recovery when the PM/procurement module is expanded.
- `main` already has the operational procurement module, but it does not have the separate `procurement-evaluation` workflow.
- The branch adds offer evaluation capabilities: document classification, OCR/text extraction, signature validation, expert-course mapping, scoring, workbook export, AI review routes, and additional Amplify persistence models.
- Do not merge directly into `main`; the branch needs reconciliation with the current procurement schema, current storage upload helper, and current AI governance patterns.

Later extraction notes:
- Use this branch as the primary reference for the future offer-evaluation feature.
- Compare it with `origin/codex/fix-lint-typecheck-build` only for overlap; avoid bringing over the stale `activity-form` refactor from that branch.
- Fold the workflow into the PM/achizitii UX intentionally, rather than replacing existing dashboards or models.
- Review dependencies, especially OCR and workbook export, before adding them to production.
