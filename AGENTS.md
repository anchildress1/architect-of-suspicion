# AGENTS.md — Architect of Suspicion

Source of truth for AI coding agents. This file overrides any default behavior.

Companion docs (read these first):
- [PRD.md](docs/PRD.md) — game rules, persona, chamber map, scoring, output
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, API contracts, DB schema, project structure, design tokens
- [SPRINT-PLAN.md](docs/SPRINT-PLAN.md) — milestones, issues, CI setup, dependencies
- [CLAIM-ENGINE-PRD.md](docs/CLAIM-ENGINE-PRD.md) — 4-pass seed pipeline

Do not duplicate information from those docs here.

## Invariants

1. The `fact` field never reaches the client — not in API responses, not in SSR HTML, not in stores
2. The raw `ai_score` from `suspicion.claim_cards` never reaches the client — the smoothed `attention` value is the only thing rendered
3. The `public.cards` schema is never modified — read-only from the game's perspective
4. Every pick is written to `suspicion.picks` **before** the client response is sent
5. Score is `-1.0` to `1.0` and is **pre-seeded by the claim engine in `suspicion.claim_cards.ai_score`**. The runtime AI never produces a score
6. The Architect never speaks unprompted — all output is a reaction to a player action
7. The Architect's reaction prose never reveals per-pick correctness or any numeric magnitude
8. Classification is permanent within a session — no undo
9. The cover letter stays in The Architect's editorial-noir voice, references only **ruled** evidence (Proof + Objection — dismissed exhibits are excluded)
10. Chamber names, slugs, and grid positions match background image filenames exactly — do not rename or reorder
11. The `About` category is excluded from gameplay
12. No authentication — anonymous sessions only, no Supabase Auth

## Coding Rules

- **No backwards compatibility** — no shims, no feature flags for old behavior, no unused exports kept for external consumers, no `_deprecated` aliases. Delete the old thing.
- NEVER check in a secret or API key into the repo or public client
- NEVER implement temporary solutions or quick fixes
- NEVER code higher than 15 cognitive complexity
- ALWAYS write unit tests for all positive, negative, error, and edge cases
- ALWAYS double check accessibility standards
- ALWAYS consider performance and optimize as you go
- ALWAYS check secure coding practices for any change
- ALWAYS test changes locally before pushing — at minimum: `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`
- Conventional commits enforced via commitlint + Lefthook
- `Generated-By` trailer on all AI-generated commits
- Always include any uncommitted or untracked user changes in the same commit — never leave user work unstaged when committing AI changes
- Prefer `async`/`await` over `.then()`/`.catch()` chains
- No raw SQL in server routes — use Supabase client with parameterized queries
- All server-side secrets via environment variables, never in source

## Package Manager

- **pnpm** is required — do not use npm or yarn
- A `Makefile` provides shortcuts for common dev commands; prefer `make <target>` over raw CLI invocations
- CI pipelines also use pnpm

## Data

- Card count: **288 non-deleted** (293 total rows including 5 soft-deleted)
- Category breakdown: About (30), Awards (20), Constraints (10), Decisions (23), Experience (45), Experimentation (39), Philosophy (34), Work Style (87)
- `About` cards are excluded from gameplay (see Invariants #11)
- The `accusations` schema is **legacy and being dropped** — do not reference or create objects in it
- The `suspicion` schema is **authoritative** for all game-state tables (`picks`, `sessions`, `claims`, `claim_cards`)
- RLS must be explicitly enabled on every new Supabase table

## Background Images

- Format: `.webp`, located in `static/backgrounds/`
- One image per chamber plus `house-exterior.webp`
- File names match chamber slugs exactly (e.g., `parlor.webp`, `control-room.webp`, `back-hall.webp`)

## Visual Language

- **Editorial noir** — bone (`#e9e4d8`) on ink (`#0b0b0d`), single hot accent ink-blood red (`#d23a2a`), cyan-ink (`#6b8fb0`) for Objection cues
- Typography: Instrument Serif (display, italic), Geist Sans (body), JetBrains Mono (readout)
- Restraint over ornament — no warm gold, no gaudy steampunk mechanics

## Testing

- **Vitest** for unit + server-route integration tests (mocked Supabase + Claude)
- Test files colocated with source: `*.test.ts` next to the module they test
- Server route tests mock Supabase client and Claude SDK — never hit real services in tests
- Vitest coverage thresholds enforced in `vite.config.ts`: ≥90% statements, ≥80% branches, ≥95% functions, ≥90% lines on `.ts` files
- `.svelte` components are exercised by Lighthouse CI and (TODO) Playwright E2E
- Lighthouse CI thresholds: desktop perf ≥0.9, mobile perf ≥0.75, a11y/best-practices/seo = 1.0

## GitHub Actions: Action Pinning

- `actions/*` references may use tagged major versions (e.g., `@v6`)
- All other actions must be pinned to a commit SHA with the version in a
  comment (e.g., `@abc123 # v4.1.0`)

## SonarCloud

- Project key: `anchildress1_architect-of-suspicion`
- All issues AND security hotspots at any severity must be resolved before merge
- Check issues: search for open issues on the project or pull request
- Check hotspots: search for security hotspots with status `TO_REVIEW`
- No inline suppressions — fix the code or get explicit user approval

## CodeQL

- Any finding at any severity fails the build
- Inline suppressions are prohibited (no `// codeql[...]` comments)
- To suppress a finding, add to `.github/codeql/suppressions.yml`:
  `rule_id`, optional `path_pattern`, `reason`, `approved_by`, `approved_date`
- Every suppression requires explicit user approval before merging

## Deploy

Single container on Cloud Run. No Firebase.

```bash
pnpm build              # or: make build
docker build -t architect-of-suspicion .
docker push gcr.io/anchildress1/architect-of-suspicion
gcloud run deploy architect-of-suspicion \
  --image gcr.io/anchildress1/architect-of-suspicion \
  --region us-central1 \
  --allow-unauthenticated
```

Production deploys go through the `deploy.yml` workflow triggered by release-please.
