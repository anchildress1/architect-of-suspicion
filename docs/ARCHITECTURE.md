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
| Database | **Supabase** (`supascribe-notes` project) | Existing card index (276 cards), PostgreSQL with RLS |
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
- **Dockerfile:** Node.js runtime, `npm run build`, serve via adapter-node

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

#### `GET /api/cards`

Fetches cards for a given room category, stripped of hidden fields.

**Query params:** `category` (required), `exclude` (comma-separated objectIDs of collected cards)

**Response:**
```json
{
  "cards": [
    {
      "objectID": "uuid",
      "title": "...",
      "blurb": "...",
      "category": "Awards",
      "signal": 4
    }
  ]
}
```

Fields excluded from response: `fact`, `tags`, `projects`, `url`, `created_at`, `updated_at`, `deleted_at`.

**Query:**
```sql
SELECT "objectID", title, blurb, category, signal
FROM public.cards
WHERE category = :category AND signal > 2
  AND "objectID" NOT IN (:exclude)
ORDER BY random() LIMIT 6
```

#### `POST /api/evaluate`

Evaluates whether a card supports or undermines the active claim. Server retrieves full card data (including `fact`) from Supabase — client never sends `fact`.

**Request:**
```json
{
  "session_id": "uuid",
  "claim": "Ashley depends on AI too much",
  "card_id": "uuid",
  "classification": "proof"
}
```

**Server-side:** Fetches full card from `public.cards` by `card_id`, passes to Claude SDK with claim.

**Response:**
```json
{
  "ai_score": 0.72,
  "ai_reaction": "The Architect's theatrical response..."
}
```

Score range: -1.0 to 1.0. Magnitude = confidence, sign = direction (negative undermines claim, positive supports).

**Side effect:** Writes to `suspicion.picks` before returning response.

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

### Card Retrieval Strategy

Cards are fetched per-room when the player enters. The 6-card hand persists while in the room. When a card is picked, one replacement is drawn from the remaining pool. The client tracks collected card IDs and passes them as exclusions.

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
  classification text NOT NULL CHECK (classification IN ('proof', 'objection')),
  ai_score numeric(3,2) NOT NULL CHECK (ai_score >= -1.0 AND ai_score <= 1.0),
  ai_reaction_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### RLS Policies

- `suspicion.sessions`: anon can INSERT (create session) and UPDATE verdict only
- `suspicion.picks`: anon can INSERT only
- `public.cards`: anon can SELECT only (already configured)
- No DELETE on any `suspicion` table from anon
- Service role used for server-side operations

## Security Considerations

- **API keys:** Claude SDK key server-side only (Cloud Run env vars)
- **Supabase:** Server routes use service role key. Client never talks to Supabase directly.
- **Rate limiting:** Basic IP-based rate limiting on server routes
- **No auth:** No user accounts. No Supabase Auth. Anonymous sessions only.
- **`fact` field protection:** The `fact` field is the core game mechanic. It must never appear in client responses. Server fetches full card data for evaluation; client receives `objectID`, `title`, `blurb`, `category`, `signal` only.
- **Input validation:** All server routes validate input before processing

## Environment Configuration

```
# Supabase
SUPABASE_URL=<supascribe-notes project url>
SUPABASE_SERVICE_ROLE_KEY=<key>

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
│   │   │   ├── Mansion.svelte         # Room grid
│   │   │   ├── Room.svelte            # Card display
│   │   │   ├── EvidenceCard.svelte    # Individual card
│   │   │   ├── ArchitectPanel.svelte  # Left-side persistent panel
│   │   │   ├── ArchitectFeed.svelte   # Feed entries
│   │   │   ├── EvidenceTally.svelte   # Proof/objection counts
│   │   │   ├── Verdict.svelte         # Accuse/Pardon flow
│   │   │   ├── CoverLetter.svelte     # Generated letter display
│   │   │   └── Resume.svelte          # Static resume
│   │   ├── stores/
│   │   │   ├── gameState.ts           # Central game state store
│   │   │   └── architect.ts           # Feed entries store
│   │   ├── types.ts                   # Game state, card types
│   │   ├── claims.ts                  # Static claim list (v1)
│   │   └── rooms.ts                   # Room-to-category mapping + grid positions
│   └── app.css                        # Tailwind + design tokens
├── supabase/
│   └── migrations/                    # suspicion schema DDL
├── static/
│   └── backgrounds/                   # Room images ({room-name}.jpg)
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
- **No E2E:** Overkill for this stage
- **AI evaluation testing:** Same card evaluated from multiple angles to verify score convergence

## Deployment

```bash
# Build
npm run build

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
2. The Architect never speaks unprompted
3. Score is -1.0 to 1.0, never binary
4. Every pick is logged to `suspicion.picks` before client response
5. The cover letter references only collected evidence
6. The cover letter is written in The Architect's theatrical voice
7. The resume is static content, not AI-generated
8. Room names and grid positions match background images exactly
9. `public.cards` schema is never modified
10. About category cards are excluded from gameplay
