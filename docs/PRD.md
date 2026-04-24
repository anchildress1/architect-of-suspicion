# Architect of Suspicion — Product Specification

**Status:** Draft v3 (Redesign — Cinematic Forge)
**Date:** 2026-04-24
**Author:** Ashley Childress + Claude (spec collaboration)

---

## Overview

Architect of Suspicion is a single-player investigative game with an editorial-noir
aesthetic — bone on ink, single hot accent, restrained typography (Instrument
Serif / Geist / JetBrains Mono). A recruiter (or anyone curious) is summoned
to a mansion of nine chambers, each holding witnesses drawn from a Supabase
index of real career decisions. They examine each witness in turn and rule it
**Proof** (it supports the claim), **Objection** (it counters), or
**Struck from the record** (they decline to rule). When the gallery has heard
enough, they render an **Accuse** or **Pardon** verdict. The Architect — a
theatrical magistrate — composes a sealed cover letter from the ruled
evidence, and a static resume sits beside it.

The AI persona — **The Architect** — is the namesake of the game. It is not a
chatbot. It is a magistrate presiding over the proceedings — dramatic, knowing,
gives the player nothing they didn't earn. It speaks only in response to player
actions, never unprompted. It never reveals scores, weights, or whether a call
was right.

## Target Audience

Recruiters, hiring managers, or anyone evaluating Ashley's work. Not job-seekers.
Not developers. People who are used to reading resumes and might appreciate
something that isn't one.

## Core Premise (Witness Mode)

1. A **claim** is presented (e.g., "Ashley depends on AI too much"), drawn at
   random from `suspicion.claims` at session start.
2. The player explores **chambers** in a mansion, each mapped to a career
   category.
3. Each chamber surfaces its full witness deck — every card pre-vetted and
   blurb-rewritten by the claim engine for this specific claim.
4. **Witness mode** — one exhibit on stage at a time, queue down the right
   rail, on-deck preview behind. Exhibits are called least-charged first
   (lowest `ambiguity * surprise`) → most-charged last.
5. The player rules each exhibit **Proof**, **Objection**, or **Dismiss**
   (struck from record).
6. The Architect reacts in character to every ruling. Reactions never reveal
   per-pick correctness.
7. The **Architect's Attention** meter on the left rail drifts with the
   trajectory of the player's rulings. Smooth, bidirectional, no per-pick
   delta. Mood labels: Drifting → Watching → Interested → Riveted.
8. When ready, the player chooses **Accuse** or **Pardon** (hold-to-arm).
9. The game generates a **sealed cover letter** from the ruled evidence
   (dismissed exhibits are excluded), beside a static **resume**.

## The Architect (AI Persona)

### Identity

The Architect is a magistrate who doesn't care about you. Editorial-noir
register — stage, gallery, ledger, the record — never gaudy steampunk
mechanics. Observes, comments, challenges. Never assists.

### Behavioral Constraints

- Never initiates conversation
- Never answers questions directly
- Never breaks character
- Never reveals scores, weights, or whether a ruling was "right"
- Never helps the player decide — but makes them doubt themselves
- Reacts to every ruling, but the reaction prose alone is the per-pick signal
- The attention meter telegraphs aggregate trajectory only

### Interaction Triggers

| Player Action | Architect Response |
|---|---|
| Enters a chamber | Brief atmospheric acknowledgment |
| Rules a witness Proof / Objection | Theatrical reaction, names a specific detail |
| Strikes a witness from the record | Notes the refusal to commit |
| Visits chambers without ruling | Notes the hesitation |
| Renders Accuse/Pardon | Composes the sealed letter |

## Chamber Map

Grid positions match background images. Do not reorder.

```
Attic (Meta)        | Gallery (Awards)     | Control Room (Constraints)
Parlor (Decisions)  | Entry Hall (sealed)  | Library (Philosophy)
Workshop (Exp.)     | Cellar (Work Style)  | Back Hall (Experience)
```

| Chamber | Category | Thematic Fit |
|---|---|---|
| Attic | Meta (non-gameplay) | How to play, custom bio, credits |
| Gallery | Awards | Trophies and recognition on display |
| Control Room | Constraints | Systems, limits, restrictions |
| Parlor | Decisions | Where deliberation happens |
| Library | Philosophy | Ideas, principles, frameworks |
| Workshop | Experimentation | Where things are tried and broken |
| Cellar | Work Style | The foundation — how the work gets done |
| Back Hall | Experience | The long corridor of professional history |
| Entry Hall | — (sealed) | Non-interactive center tile, atmospheric only |

The `About` category exists in the cards table but is excluded from gameplay —
it duplicates resume content and doesn't serve the investigation.

## Data Model

### Source

Supabase project `supascribe-notes`, table `public.cards` (293 total rows;
288 non-deleted). Each card has:

```
objectID, title, blurb, fact, url, tags, projects, category, signal,
created_at, updated_at, deleted_at
```

### Claim Engine Output

`suspicion.claim_cards` — pre-seeded by the 4-pass claim engine. Per (claim,
card) row:

- `ambiguity` (1-5) — how torn the player will be from title+blurb alone
- `surprise` (1-5) — how likely the hidden `fact` contradicts the gut read
- `ai_score` (-1.0 to 1.0) — directional truth of the card against the claim.
  Positive = supports, negative = undermines. Magnitude = confidence.
  **Pre-seeded so the runtime never asks an LLM for a score.**
- `rewritten_blurb` — claim-specific player-facing text that creates tension
  without tipping the answer

### Player-Visible Fields

- `title` — shown on witness card
- `rewritten_blurb` (substituted for `blurb`) — shown on witness card
- `category` — drives chamber routing

### Hidden Fields (server-side only)

- `fact` — the full context. Used in the Architect's reaction prompt;
  NEVER sent to client.
- `ai_score` — used for the attention meter delta. NEVER sent raw.
- `ambiguity`, `surprise` — used for witness ordering. Never sent raw.
- `tags`, `projects`, `signal` — internal selection metadata.

### Runtime Game State (client)

```ts
{
  sessionId: string,
  claimId: string,
  claimText: string,
  roomsVisited: string[],
  evidence: { card: ClaimCardEntry, classification: 'proof' | 'objection' | 'dismiss' }[],
  feed: FeedEntry[],
  attention: number,     // 0-100, smoothed, never the raw delta
  verdict: 'accuse' | 'pardon' | null,
}
```

Persisted via `sessionStorage`. Authoritative state is `suspicion.sessions` +
`suspicion.picks`.

## Claims System

### V1 (current): Pre-seeded by claim engine

Claims live in `suspicion.claims`, generated by a 4-pass AI pipeline (see
`docs/CLAIM-ENGINE-PRD.md`). Each claim has a pool of pre-vetted cards in
`suspicion.claim_cards`, each with a directional `ai_score`. One claim is
chosen at random per session via `GET /api/claim`.

### V2 (deferred): Runtime AI claims

Generate claims on demand based on observed gameplay patterns.

## Scoring / Evaluation

Each card in `suspicion.claim_cards` has a pre-seeded `ai_score` ∈ `[-1.0, 1.0]`:

- **Sign** = direction (positive supports the claim, negative undermines)
- **Magnitude** = confidence (0.1 = nearly neutral, 0.9 = decisive)

At runtime, the player's classification combines with the pre-seeded score to
produce an **attention delta** for the meter:

```
attention_delta = pickSign × ai_score
   pickSign: proof = +1,  objection = −1,  dismiss = 0
```

The delta drives the Architect's attention meter via smoothed easing — per-pick
magnitude is intentionally illegible. The runtime AI (Claude) generates only
the Architect's reaction text, never a score.

The score is never displayed as a number, never as a per-pick chip. The player
sees only the smoothed needle and one of four mood labels.

## Output: Cover Letter + Resume

### Cover Letter

Generated at runtime from the **ruled** evidence (Proof + Objection — dismissed
exhibits are excluded). Written by the AI in character as The Architect — stays
in editorial-noir register, signed "The Architect, Presiding Magistrate."

The cover letter:

- References only cards the player ruled on
- Highlights themes across the ruled evidence
- Closes with a wax seal (Accused / Pardoned)
- Should be memorable and unlike any cover letter the reader has seen

### Resume

Fixed HTML template. Professional format. Not AI-generated — this is static content.

## Technical Boundaries

### What This Is

- SvelteKit full-stack app deployed on Cloud Run
- GCP project `anchildress1`, DNS already configured
- SSR for SEO — portfolio pages must be crawlable
- Single-player, anonymous (no accounts, no auth)
- Picks + verdict logged to Supabase for traceability

### What This Is Not

- A chatbot
- A multiplayer game
- A stateless SPA (traceability data persists)
- A job application tool (no company/role inputs)

### AI Integration

- **Claude SDK** (Anthropic) — server-side only, called from SvelteKit server routes
- Per-pick reaction (`/api/evaluate`): Claude reads claim + card + history +
  pre-seeded ai_score (for context, not output). Returns plain reaction text.
- Per-room narration (`/api/narrate`): atmospheric prompts. Returns dialogue text.
- Cover letter (`/api/generate-letter`): reads ruled evidence, returns letter
  body + closing line.

### Background Images

Pre-generated industrial-mansion backgrounds exist for each chamber. File
naming convention: `static/backgrounds/{room-slug}.webp` (e.g., `attic.webp`,
`gallery.webp`, `house-exterior.webp`). The mansion exterior carries the
chamber pins on the map screen.

## Design Principles

1. **Constraint generates meaning** — narrative tension emerges from structural
   rules, not scripted events
2. **Neutral judgments are forbidden** — players must commit (Proof,
   Objection, or Dismiss; Accuse or Pardon)
3. **Information asymmetry** — the player sees title + rewritten blurb; the AI
   reacts using `fact`. The gap is the game.
4. **Per-pick correctness is invisible** — the attention meter telegraphs
   aggregate trajectory only; reactions never reveal "right" or "wrong"
5. **Grid positions are sacred** — chamber names and positions match background
   images exactly

## Resolved Questions

1. **Name:** Architect of Suspicion (game), The Architect (AI persona)
2. **Witness flow:** One exhibit at a time, queue along the right rail.
   Ordered least-charged first.
3. **Repeat visits:** Yes — player stays as long as they want, jumps within
   the queue freely.
4. **Evidence limit:** No hard cap. The Attention meter and the Architect's
   prose serve as soft pressure.
5. **Claim selection:** Random per session from `suspicion.claims`.
6. **About category:** Excluded from gameplay — duplicates resume content.
7. **AI model:** Claude SDK (Anthropic), reaction-only at runtime.
8. **Data source:** Supabase `suspicion.claim_cards` (claim-vetted) joined to
   `public.cards` (raw corpus).
9. **Persistence:** Picks + verdict logged for traceability. No accounts.
10. **Visible meter:** "The Architect's Attention" — needle, four moods, no
    raw score, no per-pick chips.

## Open Questions

1. **Mobile:** Currently desktop-only (mansion grid + queue rail). Mobile gate
   shows on <768px.
