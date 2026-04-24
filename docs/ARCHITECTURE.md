# Architect of Suspicion — Technical Architecture

**Status:** Draft v2
**Date:** 2026-04-14

---

## Stack Decision

This is a greenfield project. The stack is chosen for this project's needs, not inherited from Legacy Smelter.

### Frontend + Backend

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **SvelteKit** | Full-stack framework — handles SSR for SEO, server routes for API, and reactive UI for game state |
| Styling | **Tailwind CSS v4** | Utility-first, custom design tokens for industrial steampunk aesthetic |
| AI Model | **Claude SDK** (Anthropic) | Selected after model contest — best narrative voice and evaluation consistency |
| Database | **Supabase** (`supascribe-notes` project) | Existing card index (288 non-deleted cards), PostgreSQL with RLS |
| Deploy | **Cloud Run** on GCP project `anchildress1` | Container deploy, GCP DNS already mapped |

SvelteKit handles both frontend and server routes. No separate API service. Server routes call Supabase and Claude SDK directly. This replaces the previous FastAPI + Cloud Run (2 services) design.

### Why Not Firebase

SvelteKit is a full-stack framework with SSR, server routes, and adapters. Firebase Hosting is for static SPAs — it would require hobbling SvelteKit's server-side capabilities and bolting on Cloud Functions as a separate backend. Cloud Run lets SvelteKit be SvelteKit.

### Why Not Algolia

Supabase IS the data source. The cards live in `public.cards` with 276 entries. Algolia was a downstream search index — unnecessary when the game queries by category with a simple `WHERE` clause. One fewer service to maintain.

### Why SSR

Portfolio piece needs SEO. Recruiters and AI agents need to find it under Ashley's name. Server-rendered HTML with real meta tags beats a blank div that hydrates after JS loads.

## Hosting & Domain

- **GCP Project:** `anchildress1`
- **Domain:** Routed via GCP DNS (already configured)
- **Cloud Run Service:** Single container running SvelteKit (adapter-node)
- **Dockerfile:** Node.js runtime, `pnpm run build`, serve via adapter-node

## Data Flow

```
┌─────────────┐     ┌──────────────────┐
│   Browser    │────▶│    Cloud Run     │
│  (Player)    │     │   (SvelteKit)    │
└──────────────┘     └──────┬───────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
             ┌───────────┐   ┌───────────┐
             │  Supabase  │   │ Claude SDK │
             │ (supascribe │   │ (Anthropic)│
             │   -notes)  │   │            │
             └───────────┘   └───────────┘
```

### Server Routes

All server routes live in `src/routes/api/` and run server-side only.

#### `GET /api/claim`

Picks one claim at random from `suspicion.claims`. Used by the Summons screen
on first load.

**Response:**
```json
{ "id": "uuid", "text": "Ashley depends on AI too much" }
```

#### `GET /api/cards`

Fetches the witness deck for the active claim, restricted to one chamber category.

**Query params:** `claim_id` (required, uuid), `category` (required), `exclude` (comma-separated objectIDs of already-ruled cards)

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

Cards arrive in **Witness mode order**: ascending `ambiguity * surprise`
(`weight`). The runtime never sees `fact`, raw `ai_score`, `ambiguity`, or
`surprise` separately.

**Query (joined via Supabase client):**
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

#### `POST /api/evaluate`

Records a witness ruling. Reads the **pre-seeded** directional score from
`suspicion.claim_cards`. Calls Claude only for the in-character reaction —
the runtime AI never produces a score.

**Request:**
```json
{
  "session_id": "uuid",
  "claim_id": "uuid",
  "card_id": "uuid",
  "classification": "proof"
}
```

`classification` ∈ `{"proof", "objection", "dismiss"}`. Dismiss = struck from
record (no contribution to attention, no appearance in cover letter).

**Server-side:**
1. Reads `ai_score` from `suspicion.claim_cards` for `(claim_id, card_id)`.
2. Reads full card (with `fact`) from `public.cards` for the reaction prompt.
3. Calls Claude for reaction text.
4. Writes pick to `suspicion.picks` (with the pre-seeded `ai_score` copied,
   or `0` for Dismiss) **before** returning the response.

**Response:**
```json
{
  "ai_reaction": "...the Architect's reaction text...",
  "attention_delta": 0.72
}
```

`attention_delta = pickSign × ai_score` where `pickSign = +1 / -1 / 0` for
proof / objection / dismiss. The client uses it to nudge the smoothed
attention meter — the raw value is never displayed.

#### `POST /api/narrate`

Returns Architect dialogue based on current game state. Used for room entry, idle, and non-card-pick moments.

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
{
  "dialogue": "The Gallery remembers what you choose to overlook."
}
```

#### `POST /api/generate-letter`

Generates the cover letter from collected evidence.

**Request:**
```json
{
  "session_id": "uuid",
  "claim": "...",
  "verdict": "accuse" | "pardon"
}
```

**Server-side:** Fetches all picks for session from `suspicion.picks`, retrieves full card data for each, passes to Claude SDK.

**Response:**
```json
{
  "cover_letter": "...",
  "architect_closing": "The record has been sealed."
}
```

### Card Retrieval Strategy (Witness Mode)

The full witness deck for a chamber is fetched server-side via the room's
`+page.server.ts` load function and rendered client-side as a single exhibit
on stage with the queue down the right rail. Exhibits are dealt in order of
ascending `ambiguity * surprise` so the case warms up.

The client tracks ruled card IDs and passes them via `?exclude=…` so the deck
re-loads cleanly on refresh.

## Database

### Schemas

- **`public`** — existing cards table. Read-only. Do not modify.
- **`suspicion`** — game tables. Created via migrations in `supabase/migrations/`.

### `suspicion` Schema

```sql
CREATE SCHEMA IF NOT EXISTS suspicion;

CREATE TABLE suspicion.sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  verdict text CHECK (verdict IN ('accuse', 'pardon')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE suspicion.picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES suspicion.sessions(session_id),
  card_id uuid NOT NULL,
  classification text NOT NULL CHECK (classification IN ('proof', 'objection', 'dismiss')),
  ai_score numeric(3,2) NOT NULL CHECK (ai_score >= -1.0 AND ai_score <= 1.0),
  ai_reaction_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Pre-seeded by the claim engine (scripts/seed-claims). At runtime only the
-- runtime READS this table; writes happen through the service-role-only
-- replace_claim_seed RPC.
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

### RLS Policies

- `suspicion.sessions`: anon can INSERT (create session) and UPDATE verdict only
- `suspicion.picks`: anon can INSERT only
- `public.cards`: anon can SELECT only (already configured)
- No DELETE on any `suspicion` table from anon
- Secret key (`sb_secret_...`) used for server-side operations

## Security Considerations

- **API keys:** Claude SDK key server-side only (Cloud Run env vars)
- **Supabase:** Server routes use secret key (`sb_secret_...`). Client never talks to Supabase directly. Legacy `service_role` keys are deprecated — use the new secret key format.
- **Rate limiting:** Basic IP-based rate limiting on server routes
- **No auth:** No user accounts. No Supabase Auth. Anonymous sessions only.
- **`fact` field protection:** The `fact` field is the core game mechanic. It must never appear in client responses. Server fetches full card data for evaluation; client receives `objectID`, `title`, `blurb`, `category`, `signal` only.
- **Input validation:** All server routes validate input before processing

## Environment Configuration

```
# Supabase
SUPABASE_URL=<supascribe-notes project url>
SUPABASE_SECRET_KEY=<sb_secret_... key>

# Claude SDK
ANTHROPIC_API_KEY=<key>

# Rate Limiting
API_RATE_LIMIT_MAX_REQUESTS=30
API_RATE_LIMIT_WINDOW_MS=60000
```

## Project Structure

```
architect-of-suspicion/
├── src/
│   ├── routes/
│   │   ├── +page.svelte              # Claim intro
│   │   ├── +layout.svelte            # Root layout (background, Architect panel)
│   │   ├── mansion/
│   │   │   └── +page.svelte          # Room selection grid
│   │   ├── room/[slug]/
│   │   │   ├── +page.svelte          # Room view with cards
│   │   │   └── +page.server.ts       # Load cards for room
│   │   ├── verdict/
│   │   │   └── +page.svelte          # Verdict + cover letter + resume
│   │   ├── attic/
│   │   │   └── +page.svelte          # How to Play, Bio, Credits
│   │   └── api/
│   │       ├── cards/+server.ts       # GET /api/cards
│   │       ├── evaluate/+server.ts    # POST /api/evaluate
│   │       ├── narrate/+server.ts     # POST /api/narrate
│   │       └── generate-letter/+server.ts  # POST /api/generate-letter
│   ├── lib/
│   │   ├── server/
│   │   │   ├── supabase.ts            # Supabase client (service role)
│   │   │   ├── claude.ts              # Claude SDK client
│   │   │   └── prompts/               # AI prompt templates
│   │   ├── components/
│   │   │   ├── ArchitectPanel.svelte  # Left rail: meter + claim + feed + tally + render link
│   │   │   ├── AttentionMeter.svelte  # Needle gauge — Drifting / Watching / Interested / Riveted
│   │   │   ├── ArchitectFeed.svelte   # action / reaction / narration entries
│   │   │   ├── EvidenceTally.svelte   # Proof / Objection / Struck counts
│   │   │   ├── WitnessCard.svelte     # The exhibit on stage (with stamps)
│   │   │   ├── WitnessQueue.svelte    # Right-rail queue of remaining exhibits
│   │   │   ├── CoverLetter.svelte     # Sealed editorial-noir letter
│   │   │   ├── Resume.svelte          # Static resume
│   │   │   └── MobileGate.svelte      # <768px notice
│   │   ├── stores/
│   │   │   └── gameState.svelte.ts    # Central game state + Architect attention
│   │   ├── attention.ts               # Smoothed attention meter math
│   │   ├── types.ts                   # Game state, claim/card types
│   │   └── rooms.ts                   # Chamber-to-category mapping + grid positions
│   └── app.css                        # Tailwind + design tokens
├── supabase/
│   └── migrations/                    # suspicion schema DDL
├── static/
│   └── backgrounds/                   # Room images ({room-name}.webp)
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   └── SPRINT-PLAN.md
├── Dockerfile
├── .env.example
├── AGENTS.md
├── svelte.config.js                   # adapter-node for Cloud Run
├── vite.config.ts
├── tsconfig.json
└── lefthook.yml
```

## Testing Strategy

- **Unit tests:** Vitest for game logic (state transitions, card filtering)
- **Server route tests:** Mock Supabase + Claude SDK, test request/response contracts
- **No E2E for now:** Unit and server route tests provide sufficient coverage at this stage
- **AI evaluation testing:** Same card evaluated from multiple angles to verify score convergence

## Deployment

```bash
# Build
pnpm run build

# Docker
docker build -t architect-of-suspicion .
docker push gcr.io/anchildress1/architect-of-suspicion

# Deploy
gcloud run deploy architect-of-suspicion \
  --image gcr.io/anchildress1/architect-of-suspicion \
  --region us-central1 \
  --allow-unauthenticated
```

## Invariants

1. The `fact` field never reaches the client
2. The raw `ai_score` from `suspicion.claim_cards` never reaches the client — only the smoothed attention value
3. The Architect never speaks unprompted
4. Score is `-1.0` to `1.0`, **pre-seeded** in `suspicion.claim_cards.ai_score`. Runtime AI never scores.
5. Every pick is logged to `suspicion.picks` before client response
6. The cover letter references only **ruled** evidence (proof + objection); dismissed exhibits are excluded
7. The cover letter is written in The Architect's editorial-noir voice
8. The resume is static content, not AI-generated
9. Chamber names and grid positions match background images exactly
10. `public.cards` schema is never modified
11. About category cards are excluded from gameplay
