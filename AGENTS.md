# AGENTS.md

Guidance for agents working in this repository. Keep changes small, verified, and aligned with the existing Next.js + Amplify architecture.

## Working Style

- Prefer targeted patches over broad rewrites. Read the nearby code first and preserve local patterns.
- Do not reformat whole files, regenerate large data, or reorganize modules unless the task explicitly requires it.
- The worktree may already contain user or generated changes. Do not reset, checkout, delete, or overwrite unrelated changes.
- Before editing a touched area, inspect the current diff and work with it instead of reverting it.
- Avoid reading huge files end to end unless necessary. Use focused searches and small snippets.

## Repository Map

- `app/` contains Next.js pages and API routes.
- `components/` contains dashboard, domain, and reusable UI components. Reuse `components/ui` before adding new primitives.
- `hooks/use-backend-data.ts` contains SWR data hooks and mutation invalidation patterns.
- `lib/backend-store.ts` is the frontend-facing data service boundary.
- `lib/aws-store.ts` contains AWS/AppSync implementation details. Treat it as a high-risk, large file; patch narrowly.
- `lib/types.ts` contains shared application contracts. Keep type changes backward-compatible unless the task is a deliberate migration.
- `tests/` contains Node test-runner coverage for domain rules, imports, access, exports, RAG, AI gating, and regressions.

## Search And Context Hygiene

- Prefer `rg`, `rg --files`, `Get-Content -TotalCount`, and `Select-String`.
- Exclude noisy/generated paths unless the task is specifically about them: `.codex/backups`, `.next`, `node_modules`, `.amplify`.
- On Windows PowerShell, avoid shell patterns that PowerShell expands unpredictably. Prefer `rg --files -g "*.ts"` over broad wildcard commands.
- Use `& "C:\path\tool.exe"` when invoking quoted executable paths in PowerShell.

## Architecture Rules

- Keep Amplify SSR/compute deployment intact. Do not enable static export or add `output: "export"` to `next.config.mjs`.
- Keep secrets server-side. Never expose `OPENAI_API_KEY`, AWS credentials, or import/admin tokens through `NEXT_PUBLIC_*`, public files, logs, or responses.
- AI API routes should use `lib/ai-governance.ts`, `aiErrorResponse`, existing feature flags, and server-only environment variables.
- Preserve fallback/merge behavior for backend and local reference data. Many tests protect these contracts.
- Preserve SWR cache keys and mutation invalidation patterns unless changing the data flow intentionally.
- UI work should match existing dashboard patterns and reuse existing Radix/shadcn-style components.

## Commands In Codex Desktop On Windows

`git` and `npm` may not be available on PATH in this environment. Use the bundled executables or set PATH locally for the command.

```powershell
$env:Path = "C:\Users\RoxanaIvanov\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:Path"
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\eslint.cmd .
& "C:\Users\RoxanaIvanov\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --experimental-strip-types tests/*.test.ts
```

```powershell
& "C:\Users\RoxanaIvanov\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe" status --short
& "C:\Users\RoxanaIvanov\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe" diff --stat
```

`npm run typecheck`, `npm test`, and `git status` can fail with command-not-found if PATH is not prepared.

## Verification

- For code changes, run the narrowest relevant test first, then broaden when touching shared behavior.
- Standard local checks are:
  - `tsc --noEmit`
  - `eslint .`
  - `node --test --experimental-strip-types tests/*.test.ts`
- A known lint warning may exist in `scripts/prepare-reference-data.mjs` for `prepareActivities`. Do not treat it as caused by unrelated work unless the change touches that script.
- Current tests may emit Node `MODULE_TYPELESS_PACKAGE_JSON` warnings. Do not modify `package.json` only to silence them.

