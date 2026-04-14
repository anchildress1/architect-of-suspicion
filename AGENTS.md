# AGENTS.md — Architect of Suspicion

Source of truth for AI coding agents. This file overrides any default behavior.

Companion docs (read these first):
- [PRD.md](docs/PRD.md) — game rules, persona, room map, scoring, output
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, API contracts, DB schema, project structure, design tokens
- [SPRINT-PLAN.md](docs/SPRINT-PLAN.md) — milestones, issues, CI setup, dependencies

Do not duplicate information from those docs here.

## Invariants

1. The `fact` field never reaches the client — not in API responses, not in SSR HTML, not in stores
2. The `public.cards` schema is never modified — read-only from the game's perspective
3. Every card pick is written to `suspicion.picks` **before** the client response is sent
4. Score is -1.0 to 1.0, never binary — magnitude is confidence, sign is direction
5. The Architect never speaks unprompted — all output is a reaction to player action
6. Classification is permanent — no undo mechanic
7. The cover letter stays in The Architect's theatrical voice — no shift to corporate tone
8. Room names and grid positions match background images exactly — do not rename or reorder
9. `About` category cards are excluded from gameplay
10. No authentication — anonymous sessions only, no Supabase Auth

## Coding Rules

- NEVER code for backwards compatibility
- NEVER over-document or under-document
- NEVER check in a secret or API key into the repo or public client
- NEVER implement temporary solutions or quick fixes
- ALWAYS write unit and e2e tests for all positive, negative, error, and edge cases
- ALWAYS double check accessibility standards
- ALWAYS consider performance and optimize as you go
- ALWAYS check secure coding practices for any change
- Conventional commits enforced via commitlint + Lefthook
- `Generated-By` trailer on all AI-generated commits
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
- `About` cards are excluded from gameplay (see Invariants #9)
- The `accusations` schema is **legacy and being dropped** — do not reference or create objects in it
- The `suspicion` schema is **authoritative** for all game-state tables (`picks`, `sessions`, etc.)
- RLS must be explicitly enabled on every new Supabase table

## Background Images

- Format: `.webp`, located in `static/backgrounds/`
- One image per room plus `house-exterior.webp`
- File names match room slugs exactly (e.g., `parlor.webp`, `control-room.webp`)

## Testing

- **Vitest** for unit tests
- Test files colocated with source: `*.test.ts` next to the module they test
- Server route tests mock Supabase client and Claude SDK — never hit real services in tests

## GitHub Actions: Action Pinning

- `actions/*` references may use tagged major versions (e.g., `@v6`)
- All other actions must be pinned to a commit SHA with the version in a
  comment (e.g., `@abc123 # v4.1.0`)

## CodeQL

- Any finding at any severity fails the build
- Inline suppressions are prohibited (no `// codeql[...]` comments)
- To suppress a finding, add to `.github/codeql/suppressions.yml`:
  `rule_id`, optional `path_pattern`, `reason`, `approved_by`, `approved_date`
- Every suppression requires explicit user approval before merging

### Approved CodeQL Suppressions

| Rule ID | Path Pattern | Reason | Approved By | Date |
|---------|-------------|--------|-------------|------|
| — | — | — | — | — |

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

## What NOT to Do

- Do not modify `public.cards` schema
- Do not store secrets in source control or Docker images
- Do not add authentication
- Do not create a "neutral" classification — only Proof or Objection
- Do not allow classification undo
- Do not show `fact` to the player during gameplay
- Do not let The Architect help players decide
- Do not surface `About` category cards in gameplay
- Do not rename rooms or reorder the grid
