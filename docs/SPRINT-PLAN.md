# Architect of Suspicion — Sprint Plan

**Status:** Draft v2
**Date:** 2026-04-14

---

## Milestone Overview

| Milestone | Description | Depends On |
|---|---|---|
| **M0: Foundation** | Repo, CI, hosting, design tokens, Supabase schema | Nothing |
| **M1: Skeleton** | Navigable mansion with rooms, no AI | M0 |
| **M2: Cards** | Supabase integration, card display, pick mechanics | M1 |
| **M3: The Architect** | AI evaluation + narrative system (Claude SDK) | M2 |
| **M4: Verdict** | Accuse/Pardon flow, cover letter generation | M3 |
| **M5: Polish** | Design, animation, sound, Attic content, resume | M4 |
| **M6: Ship** | Domain, deploy, final testing | M5 |

---

## M0: Foundation

**Goal:** Empty app deploys to Cloud Run. CI pipeline passes. Design system defined. Supabase schema exists.

### Issues

#### M0-1: Create GitHub repo and configure
- Create `anchildress1/architect-of-suspicion` repo
- Branch protection on `main`: require PR, require status checks, no force push
- Enable Dependabot:
  ```yaml
  # .github/dependabot.yml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule:
        interval: "weekly"
    - package-ecosystem: "github-actions"
      directory: "/"
      schedule:
        interval: "weekly"
  ```

#### M0-2: Scaffold project
- `pnpm create svelte@latest` with SvelteKit skeleton
- Install Tailwind CSS v4
- Install Vitest
- Configure adapter-node for Cloud Run
- Create Dockerfile
- First deploy: blank page on Cloud Run

#### M0-3: Configure CI pipeline

**`.github/workflows/ci.yml`** — runs on all PRs and pushes to `main`:

1. Lint + Typecheck: `svelte-check`, `eslint`
2. Test: `vitest run --coverage`
3. SonarCloud upload: coverage report via `sonarcloud-github-action`
4. Build: `npm run build`

SonarCloud config (`sonar-project.properties`):
```properties
sonar.projectKey=anchildress1_architect-of-suspicion
sonar.organization=<sonarcloud-org>
sonar.sources=src
sonar.tests=src
sonar.test.inclusions=**/*.test.ts,**/*.spec.ts
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.coverage.exclusions=src/routes/api/**/*.ts
```

Requires `SONAR_TOKEN` secret in repo settings.

**`.github/workflows/codeql.yml`** — runs on all PRs and pushes to `main`:
- Analyzes `javascript-typescript`
- Any finding at any severity fails the build
- Inline suppressions prohibited — use `.github/codeql/suppressions.yml` instead

**`.github/workflows/release-please.yml`** — runs on push to `main`:
- `googleapis/release-please-action` pinned to commit SHA
- Config: `release-please-config.json` + `.release-please-manifest.json`
- Conventional commits drive versioning

**`.github/workflows/deploy.yml`** — runs on release created:
1. Build Docker image
2. Push to `gcr.io/anchildress1/architect-of-suspicion`
3. Deploy to Cloud Run (`us-central1`, `--allow-unauthenticated`)

#### M0-4: Configure Lefthook
```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint:
      run: npx eslint --max-warnings 0 {staged_files}
      glob: "*.{ts,svelte}"
    typecheck:
      run: npx svelte-check --threshold error
    format:
      run: npx prettier --check {staged_files}

commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}
```

#### M0-5: Define design tokens
- Industrial steampunk palette (see ARCHITECTURE.md design tokens section for values)
- Typography: Cinzel (display), Rajdhani (body), IBM Plex Mono (code), Share Tech Mono (readouts)
- Card styles, button styles, glass effect
- Must work over dark photographic backgrounds
- Document in `app.css` as Tailwind `@theme` tokens

#### M0-6: Add background images
- Rename existing room images to `{room-name}.webp`
- Place in `static/backgrounds/`
- One image per room (9 rooms + 1 exterior)

#### M0-7: Create `suspicion` schema
- Write migration for `suspicion.sessions` and `suspicion.picks` (see ARCHITECTURE.md for DDL)
- Configure RLS policies
- Deploy migration to `supascribe-notes` Supabase project
- Verify `public.cards` access from service role

#### M0-8: Write AGENTS.md
- Coding conventions for AI collaborators
- Invariants that aren't captured in other docs
- Deploy instructions

---

## M1: Skeleton

**Goal:** Player can navigate the mansion. Click a room, enter it, go back. No cards yet.

### Issues

#### M1-1: Build Mansion view
- Full-screen background image of mansion exterior
- 3x3 grid matching room positions (see PRD room map)
- Clickable room tiles with hover states (room name + category)
- Entry Hall center tile disabled (atmospheric only)
- Attic accessible but separate from gameplay rooms

#### M1-2: Build Room view
- Full-screen room background image
- Room title overlay
- Back to Mansion navigation
- Empty card grid (6 placeholder slots)

#### M1-3: Build Attic view
- How to Play section
- Bio section (custom-written, not from About cards)
- Credits

#### M1-4: Implement game state store
- Svelte store: claim, rooms visited, evidence piles, feed entries, verdict
- State resets on page refresh (not persisted client-side)

#### M1-5: Build Architect panel (left side)
- Persistent 300px panel on left during mansion + room views
- Always visible — not expandable, not collapsible
- Feed section (top, scrollable) — empty for now
- Evidence tally (bottom, pinned) — proof/objection counts

---

## M2: Cards

**Goal:** Real cards from Supabase appear in rooms. Player can pick and classify.

### Issues

#### M2-1: Server route — fetch cards
- `GET /api/cards` — server-side Supabase query filtered by category
- Strip hidden fields from response (see ARCHITECTURE.md)

#### M2-2: Build EvidenceCard component
- Displays title + blurb
- Proof / Objection classification buttons
- Visual distinction once picked (dimmed, slides out)

#### M2-3: Wire cards into Room view
- Fetch 6 cards on room entry (excluding already collected)
- When a card is picked, replacement drawn from pool
- Remaining 5 cards stay visible
- Room exhausted when pool runs dry

#### M2-4: Implement pick mechanics
- Player picks one card → chooses proof or objection
- Classification is permanent (no undo)
- Card added to evidence store
- Feed entry added

#### M2-5: Create session on game start
- Server route creates `suspicion.sessions` row with claim text
- Returns session_id to client

#### M2-6: Define static claims (v1)
- Create claims module with curated list
- Game start: random claim assignment

---

## M3: The Architect

**Goal:** AI evaluates picks and delivers narrative. Hardest milestone.

### Issues

#### M3-1: Server route — evaluate card
- `POST /api/evaluate` (see ARCHITECTURE.md for contract)
- Server fetches full card from `public.cards` including `fact`
- Calls Claude SDK, returns score (-1.0 to 1.0) + reaction
- Writes to `suspicion.picks` before returning

#### M3-2: Server route — narrate
- `POST /api/narrate` (see ARCHITECTURE.md for contract)
- Returns Architect dialogue for non-card-pick moments

#### M3-3: Build Architect feed
- Chronological thread in left panel
- Each pick produces a pair: action entry + Architect reaction
- Auto-scrolls to latest, entries animate in

#### M3-4: Wire evaluation into card picks
- On classify, fire `/api/evaluate`
- Display returned reaction in feed
- Score NOT shown to player

#### M3-5: AI prompt design
- Evaluation prompt (score + reaction)
- Architect system prompt (theatrical showman persona)
- Cover letter generation prompt (stays in character)
- Test perspective invariance

---

## M4: Verdict

**Goal:** Player can accuse or pardon. Game ends. Cover letter generates.

### Issues

#### M4-1: Build Verdict flow
- Accuse / Pardon buttons always visible
- Requires at least 1 pick before enabled
- Confirmation step
- Updates `suspicion.sessions` with verdict

#### M4-2: Server route — generate cover letter
- `POST /api/generate-letter` (see ARCHITECTURE.md for contract)
- Generates letter in Architect's theatrical voice

#### M4-3: Build CoverLetter display
- Clean typography, printable/copyable
- Download as PDF (nice-to-have)

#### M4-4: Build Resume display
- Fixed HTML template, professional format, not AI-generated

#### M4-5: Build "Play Again" flow
- Reset client state, new claim, new session

---

## M5: Polish

**Goal:** Looks and feels good.

### Issues

#### M5-1: Visual design pass
- Glass-over-darkness cards, riveted edges, iron-plate feel
- Brass/copper industrial buttons
- Typography hierarchy finalized
- Mobile graceful degradation

#### M5-2: Transitions and animation
- Room entry/exit, card pick (slide out + replacement), feed entries, verdict sequence

#### M5-3: Sound design (optional)
- Ambient industrial sounds, card pick, Architect cue, verdict

#### M5-4: Attic content finalization
- How to Play copy, custom bio, credits

#### M5-5: Author resume static content
- Ashley provides or approves copy

#### M5-6: Mobile handling
- Desktop-only message or simplified responsive layout

---

## M6: Ship

**Goal:** Live on the domain. Tested. Done.

### Issues

#### M6-1: Domain configuration
- Cloud Run custom domain mapping
- SSL, DNS (already on GCP)

#### M6-2: Production deployment
- Env vars in Cloud Run (Anthropic key, Supabase service role key)
- Rate limiting verified

#### M6-3: Final testing
- Full playthrough: all rooms, all claim types
- Cover letter + Architect reaction quality review
- Performance check (images, API latency)
- Mobile degradation verified

#### M6-4: SEO and OG metadata
- `og:title`, `og:description`, `og:image`
- Verify SSR renders crawlable HTML
- Structured data where appropriate

---

## Dependencies & Blockers

| Blocker | Owner | Status |
|---|---|---|
| Background images | Ashley | Existing, need rename + add to repo |
| Anthropic API key | Ashley | Needed for Cloud Run |
| Supabase service role key | Ashley | Existing `supascribe-notes` project |
| SonarCloud org + token | Ashley | Needs setup |
| GitHub repo creation | Ashley | Not yet created |
| Resume content | Ashley | Needs to provide or approve |
| Bio content for Attic | Ashley | Custom-written |

## Estimated Effort

| Milestone | Estimate |
|---|---|
| M0: Foundation | 1-2 sessions |
| M1: Skeleton | 2-3 sessions |
| M2: Cards | 2-3 sessions |
| M3: The Architect | 3-5 sessions (hardest) |
| M4: Verdict | 2-3 sessions |
| M5: Polish | 2-4 sessions |
| M6: Ship | 1-2 sessions |

"Session" = one focused Claude coding session.

## v2 Deferred

- Tension system implementation (escalation bands, phase thresholds)
- AI-generated claims from card corpus
- Session replay
- Room cooldown mechanics
- Analytics dashboard for traceability data
