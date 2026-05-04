# Architect of Suspicion — Technical Architecture

**Status:** Draft v3 (post-redesign, capability-token sessions)
**Date:** 2026-05-01

The stack overview, the runtime topology diagram, the deploy command, and the runtime env vars all live in [`README.md`](../README.md). This doc covers what the README intentionally doesn't: the server route contracts, the database schema, RLS, the session capability-token scheme, the project structure, and decisions worth recording for anyone who comes back to this codebase a year from now.

---

## Decisions worth recording

- **No Firebase.** SvelteKit is full-stack; Firebase Hosting forces the SPA shape and would require Cloud Functions as a separate backend. Cloud Run lets SvelteKit run end-to-end.
- **No Algolia.** Supabase is the data source. The game queries by category with simple `WHERE` clauses; a downstream search index would just be another service to keep alive.
- **SSR is non-negotiable.** Recruiters and indexers need real meta tags on the first byte, not a hydrated blank div.
- **Polka + compression in front of adapter-node.** `scripts/server.js` adds gzip/br and graceful shutdown for Cloud Run without forking the SvelteKit adapter.
- **Capability tokens, not auth.** The site is anonymous, but `session_id` alone is a guessable identifier. Tokens add possession-proof without introducing accounts.

---

## Server routes

All server routes live under `src/routes/api/` and run server-side only. State-changing routes verify the session capability token (see [Session capability tokens](#session-capability-tokens)) before reading or writing.

Shared helpers live in `src/lib/server/`:

- `supabase.ts` — Supabase client constructed with the secret key
- `claude.ts` — Anthropic SDK client + prompt orchestration
- `cards.ts`, `claims.ts` — typed Supabase queries
- `rateLimit.ts` — IP-based per-route guard
- `validation.ts` — UUID checks, JSON body size limits
- `sessionCapability.ts` — mint/verify capability tokens, set/clear cookies

### Landing page (`/`)

`src/routes/+page.server.ts` picks a claim during SSR via `pickRandomClaim()` so the entry-point record renders on the first byte without a client fetch. When the pick fails (e.g. Supabase unavailable in LHCI), the page returns `{ claim: null }` and renders a muted "record unavailable" state — no browser console errors.

### `POST /api/sessions`

Creates a new game session for a claim. Mints a capability token, stores its SHA-256 hash on the session row, and sets the token + session cookies on the response.

**Request:**

```json
{ "claim_id": "uuid" }
```

**Response:**

```json
{
  "session_id": "uuid",
  "claim_id": "uuid",
  "claim_text": "...",
  "attention": 50
}
```

`attention` is the baseline (`BASELINE_ATTENTION` from `$lib/attention`). Subsequent state-changing routes require both the session cookie and the capability token cookie.

### `GET /api/cards`

Returns the witness deck for the active claim, restricted to one chamber category and excluding any cards already ruled.

**Query params:** `claim_id` (uuid, required), `category` (required, must be a playable room), `exclude` (comma-separated UUIDs)

**Response:**

```json
{
  "cards": [
    {
      "objectID": "uuid",
      "title": "...",
      "blurb": "...claim-specific rewritten blurb...",
      "category": "Awards",
      "weight": 9
    }
  ]
}
```

Cards arrive in **Witness mode order**: ascending `ambiguity * surprise` (`weight`). The runtime never sees `fact`, raw `ai_score`, `ambiguity`, or `surprise` separately.

**Underlying query (Supabase client, joined):**

```sql
SELECT cc.card_id, cc.ambiguity, cc.surprise, cc.rewritten_blurb,
       c."objectID", c.title, c.category
FROM suspicion.claim_cards cc
JOIN public.cards c ON c."objectID" = cc.card_id
WHERE cc.claim_id = :claim_id
  AND c.deleted_at IS NULL
  AND c.category = :category
  AND cc.card_id NOT IN (:exclude)
ORDER BY (cc.ambiguity * cc.surprise) ASC;
```

### `POST /api/evaluate`

Records a witness ruling. Reads the **pre-seeded** directional score from `suspicion.claim_cards`; calls Claude only for the in-character reaction. The runtime AI never produces a score.

**Request:**

```json
{
  "session_id": "uuid",
  "claim_id": "uuid",
  "card_id": "uuid",
  "classification": "proof"
}
```

`classification` ∈ `{"proof", "objection", "dismiss"}`. Dismiss strikes the witness from the record — no contribution to attention, no appearance in the cover letter.

**Server-side flow:**

1. Verify the capability token against `suspicion.sessions.session_token_hash` for the supplied `session_id`.
2. Read the current `attention` from `suspicion.sessions`.
3. Read `ai_score` from `suspicion.claim_cards` for `(claim_id, card_id)`.
4. Read the full card (with `fact`) from `public.cards` for the reaction prompt.
5. Call Claude for reaction text.
6. Insert the pick into `suspicion.picks` (with the pre-seeded `ai_score` copied — `0` for Dismiss) **before** returning the response. The unique `(session_id, card_id)` constraint rejects re-rulings with `409`.
7. Compute the new smoothed `attention` via `applyAttentionDelta`, persist it on the session, and return the post-smoothing integer.

**Response:**

```json
{
  "ai_reaction": "...the Architect's reaction text...",
  "attention": 62,
  "reaction_fallback": false
}
```

`attention` is the integer `[0, 100]` the needle should read. The raw `ai_score` magnitude never crosses the wire — Invariant #2 in `AGENTS.md`. The `reaction_fallback` flag lets the UI show a subdued state when Claude was unreachable instead of pretending the Architect spoke.

### `POST /api/narrate`

Returns Architect dialogue for room-entry, idle, and other non-card moments.

**Request:**

```json
{
  "claim": "...",
  "action": "enter_room" | "idle" | "wander",
  "room": "gallery",
  "evidence_count": { "proof": 3, "objection": 1 },
  "rooms_visited": ["parlor", "gallery"]
}
```

**Response:**

```json
{ "dialogue": "The Gallery remembers what you choose to overlook." }
```

### `POST /api/generate-letter`

Generates the cover letter from collected evidence.

**Request:**

```json
{
  "session_id": "uuid",
  "claim": "...",
  "verdict": "accuse" | "pardon"
}
```

**Server-side:** verifies the capability token, then loads three things in
parallel:

1. The claim's truth context — `hireable_truth` + `desired_verdict` from
   `suspicion.claims`. The brief always reveals `hireable_truth` regardless
   of verdict; `desired_verdict` only swings the rhetorical opener.
2. The paramount card pool — every `suspicion.claim_cards` row with
   `is_paramount = true`, joined to `public.cards` for the full record
   (including `fact`, server-only). The brief surfaces these whether the
   player ruled them or not.
3. All picks for the session from `suspicion.picks`, joined to `public.cards`.

The route partitions the picks: paramount cards get their classification
attached (or `null` when skipped, which the prompt calls out as a gap);
non-paramount Proof + Objection rulings become personalization. Dismiss
rulings stay struck. The combined context is passed to Claude.

Persists `cover_letter` and `architect_closing` back onto the session row so
a refresh after a sessionStorage flush still surfaces the verdict. The route
returns 500 if the truth context is missing OR the paramount pool is empty —
the prompt is never asked to invent its framing or ride personalization
alone (AGENTS.md Invariant #8).

**Response:**

```json
{
  "cover_letter": "...",
  "architect_closing": "The record has been sealed."
}
```

### Card retrieval (Witness mode)

The full witness deck for a chamber is fetched server-side via the room's `+page.server.ts` load function and rendered client-side as a single exhibit on stage with the queue down the right rail. Exhibits are dealt in ascending `ambiguity * surprise` so the case warms up.

The client tracks ruled card IDs and passes them via `?exclude=…` so the deck reloads cleanly on refresh.

---

## Database

### Schemas

- **`public`** — existing cards table. Read-only. Never modified by this app.
- **`suspicion`** — game tables. Migrations in `supabase/migrations/`.
- **`accusations`** — legacy, dropped in the very first `suspicion` migration.

### `suspicion.sessions`

One row per playthrough. Columns added across migrations: `claim_id` (FK to `suspicion.claims`, `ON DELETE SET NULL`), `attention` (smoothed 0–100 needle value, default `50`), `cover_letter` and `architect_closing` (persisted verdict text), `session_token_hash` (SHA-256 hex of the capability token, NOT NULL).

```sql
CREATE TABLE suspicion.sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  claim_id uuid REFERENCES suspicion.claims(id) ON DELETE SET NULL,
  verdict text CHECK (verdict IN ('accuse', 'pardon')),
  attention smallint NOT NULL DEFAULT 50
            CHECK (attention >= 0 AND attention <= 100),
  cover_letter text,
  architect_closing text,
  session_token_hash text NOT NULL
            CHECK (session_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### `suspicion.picks`

One row per witness ruling. Classification now includes `'dismiss'`. A unique `(session_id, card_id)` constraint enforces classification permanence (Invariant #7 in `AGENTS.md`) at the database level.

```sql
CREATE TABLE suspicion.picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES suspicion.sessions(session_id),
  card_id uuid NOT NULL,
  classification text NOT NULL
            CHECK (classification IN ('proof', 'objection', 'dismiss')),
  ai_score numeric(3,2) NOT NULL
            CHECK (ai_score >= -1.0 AND ai_score <= 1.0),
  ai_reaction_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (session_id, card_id)
);
```

### `suspicion.claims` and `suspicion.claim_cards`

Populated by the offline claim engine (`scripts/seed-claims`) via the `replace_claim_seed` RPC (`SECURITY DEFINER`, granted to `service_role` only). At runtime the app reads these tables but never writes to them.

`suspicion.claims` carries `hireable_truth` (NOT NULL with non-empty CHECK)
and `desired_verdict` (NOT NULL CHECK in `('accuse','pardon')`). Together
they anchor the runtime cover letter prompt: `hireable_truth` is the single
positive trait the brief reveals regardless of verdict; `desired_verdict`
flags whether the surface claim is true or false of Ashley, swinging only
the rhetorical opener. `suspicion.claim_cards.is_paramount` (boolean,
default false) flags the cards essential to revealing the truth — the brief
surfaces them whether or not the player ruled them, calling out
paramount-but-skipped as gaps. See PRD.md §"Cover Letter" and Pass 1 / Pass
2 / Pass 4 of [`CLAIM-ENGINE-PRD.md`](CLAIM-ENGINE-PRD.md).

```sql
CREATE TABLE suspicion.claim_cards (
  claim_id uuid NOT NULL REFERENCES suspicion.claims(id) ON DELETE CASCADE,
  card_id  uuid NOT NULL REFERENCES public.cards("objectID"),
  ambiguity smallint NOT NULL CHECK (ambiguity BETWEEN 1 AND 5),
  surprise  smallint NOT NULL CHECK (surprise  BETWEEN 1 AND 5),
  ai_score  numeric(3,2) NOT NULL DEFAULT 0.0
            CHECK (ai_score >= -1.0 AND ai_score <= 1.0),
  rewritten_blurb text NOT NULL,
  PRIMARY KEY (claim_id, card_id)
);
```

The 4-pass pipeline that fills these tables is documented in [`CLAIM-ENGINE-PRD.md`](CLAIM-ENGINE-PRD.md).

### RLS

- `suspicion.sessions`: anon may INSERT and UPDATE (column-level grants restrict anon writes to `verdict`, `updated_at`)
- `suspicion.picks`: anon may INSERT only; reads go through server routes using the secret key
- `public.cards`: anon may SELECT only (already configured at the project level)
- No DELETE policies on any `suspicion` table from anon
- `service_role` has full access on the schema; server routes use the secret key

---

## Security

### Session capability tokens

`session_id` alone is not sufficient to mutate game state. On `POST /api/sessions` the server mints a high-entropy random token, stores its SHA-256 hash on the session row (`session_token_hash`), and sets two cookies on the response: the session id and the raw token. State-changing routes (`/api/evaluate`, `/api/generate-letter`) recompute the SHA-256 of the presented token and require an exact hex match against the stored hash before doing any work. Pre-existing sessions without a hash were deleted in the migration that introduced the column — there is no backwards-compatibility path.

### Other controls

- **API keys** are server-side only (Cloud Run env vars). Claude SDK keys never reach the client.
- **Supabase access** uses the new `sb_secret_…` key format. Legacy `service_role` keys are deprecated. The browser never talks to Supabase directly.
- **Rate limiting** is IP-based at the route level (`src/lib/server/rateLimit.ts`).
- **No auth.** No user accounts, no Supabase Auth. Anonymous sessions only — capability tokens are a possession-proof scheme, not an identity scheme.
- **`fact` field protection** is the core game mechanic. The full `fact` text is only ever read inside `/api/evaluate` for the reaction prompt; the client receives `objectID`, `title`, `blurb`, `category`, `weight` only.
- **Input validation** at every server route: UUID checks, JSON body size limits, category allowlists.

---

## Claim-engine environment

The runtime env vars (`SUPABASE_*`, `ANTHROPIC_API_KEY`, rate-limit knobs) are documented in the README. The offline claim engine adds these (only needed when running `scripts/seed-claims`):

```
OPENAI_API_KEY=<key>
GEMINI_API_KEY=<key>

# Per-pass model overrides — defaults in scripts/seed-claims/config.ts
CLAIM_ENGINE_PASS1_MODEL=gpt-5.2
CLAIM_ENGINE_PASS2_MODEL=gemini-3.1-pro-preview
CLAIM_ENGINE_PASS3_MODEL=claude-haiku-4-5
CLAIM_ENGINE_PASS4_MODEL=gpt-5-mini

# Pipeline tuning
CLAIM_ENGINE_GENERATE_CLAIMS=15   # Pass 2 candidate count
CLAIM_ENGINE_SELECT_CLAIMS=5      # Pass 3 top-N to rewrite
CLAIM_ENGINE_TOP_CARDS=50         # Max cards per claim pool (Pass 3)
CLAIM_ENGINE_CARD_FLOOR=3         # Min ambiguity+surprise to stay in pool
CLAIM_ENGINE_SCORE_BATCH=50       # Cards per Pass 3 scoring call
CLAIM_ENGINE_MIN_TOTAL_CARDS=30   # Survival floor: rewritten cards per claim
CLAIM_ENGINE_MIN_ROOMS=5          # Survival floor: distinct rooms per claim
CLAIM_ENGINE_DRY_RUN=false
```

See [`CLAIM-ENGINE-PRD.md`](CLAIM-ENGINE-PRD.md) for what each pass does with these.

---

## Project structure

```
architect-of-suspicion/
├── src/
│   ├── routes/
│   │   ├── +page.svelte              # Claim intro
│   │   ├── +page.server.ts           # SSR claim pick
│   │   ├── +layout.svelte            # Root layout (background, Architect panel)
│   │   ├── +error.svelte             # Error boundary
│   │   ├── mansion/+page.svelte      # Chamber selection grid
│   │   ├── room/[slug]/
│   │   │   ├── +page.svelte          # Witness stage + queue
│   │   │   └── +page.server.ts       # Load deck for chamber
│   │   ├── verdict/+page.svelte      # Accuse/Pardon, cover letter, resume
│   │   ├── attic/+page.svelte        # How to Play, bio, credits
│   │   └── api/
│   │       ├── sessions/+server.ts        # POST  /api/sessions
│   │       ├── cards/+server.ts           # GET   /api/cards
│   │       ├── evaluate/+server.ts        # POST  /api/evaluate
│   │       ├── narrate/+server.ts         # POST  /api/narrate
│   │       └── generate-letter/+server.ts # POST  /api/generate-letter
│   ├── lib/
│   │   ├── server/
│   │   │   ├── supabase.ts            # Supabase client (secret key)
│   │   │   ├── claude.ts              # Claude SDK client
│   │   │   ├── cards.ts               # fetchClaimDeck etc.
│   │   │   ├── claims.ts              # getClaimById, pickRandomClaim
│   │   │   ├── sessionCapability.ts   # mint/verify capability tokens + cookies
│   │   │   ├── rateLimit.ts           # Per-IP route guard
│   │   │   ├── validation.ts          # UUID checks, JSON body limits
│   │   │   └── prompts/               # Claude prompt templates
│   │   ├── components/
│   │   │   ├── ArchitectPanel.svelte  # Left rail: meter + claim + feed + tally
│   │   │   ├── AttentionMeter.svelte  # Needle gauge — Drifting → Riveted
│   │   │   ├── ArchitectFeed.svelte   # action / reaction / narration entries
│   │   │   ├── EvidenceTally.svelte   # Proof / Objection / Struck counts
│   │   │   ├── WitnessCard.svelte     # The exhibit on stage (with stamps)
│   │   │   ├── WitnessQueue.svelte    # Right-rail queue
│   │   │   ├── CoverLetter.svelte     # Sealed industrial-noir record
│   │   │   ├── Resume.svelte          # Static resume
│   │   │   └── MobileGate.svelte      # <768px notice
│   │   ├── stores/                    # Svelte 5 runes-based game state
│   │   ├── attention.ts               # Smoothed attention math + baseline
│   │   ├── narrate.ts                 # Client-side narrate orchestration
│   │   ├── mansionPins.ts             # Authoritative pin coordinates
│   │   ├── rooms.ts                   # Chamber → category mapping + grid
│   │   └── types.ts                   # Game state, claim/card types
│   └── app.css                        # Tailwind v4 + design tokens
├── scripts/
│   ├── server.js                      # Polka + compression production server
│   └── seed-claims/                   # 4-pass claim engine
├── supabase/migrations/               # suspicion schema DDL (chronological)
├── static/backgrounds/                # Chamber images ({slug}.webp)
├── docs/                              # PRD, this doc, claim engine, sprint plan
├── Dockerfile
├── lefthook.yml
├── svelte.config.js                   # adapter-node
├── vite.config.ts
└── tsconfig.json
```

---

## Testing thresholds

- **Vitest** for unit + server-route integration tests; coverage thresholds enforced in `vite.config.ts` (≥90% statements, ≥80% branches, ≥95% functions, ≥90% lines on `.ts` files).
- Test files are colocated: `*.test.ts` next to the module they test.
- Server-route tests **mock** the Supabase client and Claude SDK — never hit real services.
- `.svelte` components are exercised by Lighthouse CI today (Playwright E2E is on the roadmap).
- Lighthouse CI thresholds: desktop perf ≥0.9, mobile perf ≥0.75, a11y / best-practices / SEO = 1.0.

---

## Invariants

The full invariant list lives in [`AGENTS.md`](../AGENTS.md#invariants). Anything in this doc that disagrees with `AGENTS.md` is a bug here.
