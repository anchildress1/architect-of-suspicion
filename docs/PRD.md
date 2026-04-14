# Architect of Suspicion — Product Specification

**Status:** Draft v2
**Date:** 2026-04-14
**Author:** Ashley Childress + Claude (spec collaboration)

---

## Overview

Architect of Suspicion is a single-player investigative game with an industrial steampunk aesthetic — mechanical, not literary. A recruiter (or anyone curious) enters a mansion of exposed gears, riveted iron, and forge-lit chambers. They investigate rooms, collect evidence from a Supabase index of real career decisions, and ultimately accuse or pardon the subject — Ashley Childress — of a claim. The game produces a personalized cover letter built from the evidence collected, alongside a standard resume.

The AI persona — **The Architect** — is the namesake of the game. It is not a chatbot. It is a theatrical showman presiding over the proceedings — dramatic, fantastical, big energy, doesn't give a shit. It speaks only in response to player actions, never unprompted.

## Target Audience

Recruiters, hiring managers, or anyone evaluating Ashley's work. Not job-seekers. Not developers. People who are used to reading resumes and might appreciate something that isn't one.

## Core Premise

1. A **claim** is presented (e.g., "Ashley depends on AI too much")
2. The player explores **rooms** in a mansion, each mapped to a career category
3. Each room surfaces **6 cards** (title + blurb only visible to the player)
4. The player picks one card at a time, classifying it as **proof** or **objection**
5. The picked card is replaced from the pool; the other 5 stay visible
6. The AI evaluates each pick using the full card data (including `fact`) and returns a score (-1.0 to 1.0) + a dramatic reaction
7. The player does **not** learn per-card scores during play — only The Architect's reactions
8. When ready, the player chooses to **Accuse** or **Pardon**
9. The game generates a **cover letter** from collected evidence + displays a **standard resume**

## The Architect (AI Persona)

### Identity

The Architect is a theatrical showman who doesn't care about you. Dramatic theater energy, fantastical flair, industrial steampunk magistrate putting on a show for an audience of one. It observes, comments, and challenges — but never assists. Never helpful.

### Behavioral Constraints

- Never initiates conversation
- Never answers questions directly
- Never breaks character
- Never reveals per-card scores during play
- Never helps the player decide
- Reacts to the *trajectory* of the player's evidence, not individual picks
- Can redirect a lost player through atmospheric narration ("The gallery grows restless. Perhaps you've lingered long enough.")

### Interaction Triggers

| Player Action | Architect Response |
|---|---|
| Enters a room | Brief atmospheric acknowledgment |
| Picks a card for proof | Dramatic reaction to the classification |
| Picks a card for objection | Same as above |
| Has been idle too long | Subtle prompt to continue |
| Visits rooms without picking | Notes the hesitation |
| Initiates Accuse/Pardon | Shifts register — the trial concludes |
| Game ends | Delivers verdict narration before cover letter |

### Narrative Escalation (v2 — defined, deferred)

Tension score 0-100 tracked in client state. Drives narrative register when implemented:

- **0-25:** Neutral, observational
- **25-50:** Engaged, pointed
- **50-75:** Stakes language — "The scales tip"
- **75-100:** Full dramatic mode — "The record speaks for itself"

V1 uses a single tone throughout.

## Room Map

Grid positions match background images. Do not reorder.

```
Attic (Meta)        | Gallery (Awards)     | Control Room (Constraints)
Parlor (Decisions)  | Entry Hall (dead)    | Library (Philosophy)
Workshop (Exp.)     | Cellar (Work Style)  | Back Hall (Experience)
```

| Room | Category | Thematic Fit |
|---|---|---|
| Attic | Meta (non-gameplay) | How to play, custom bio, credits |
| Gallery | Awards | Trophies and recognition on display |
| Control Room | Constraints | Systems, limits, restrictions |
| Parlor | Decisions | Where deliberation happens |
| Library | Philosophy | Ideas, principles, frameworks |
| Workshop | Experimentation | Where things are tried and broken |
| Cellar | Work Style | The foundation — how the work gets done |
| Back Hall | Experience | The long corridor of professional history |
| Entry Hall | — (dead) | Non-interactive center tile, atmospheric only |

The `About` category exists in the cards table but is excluded from gameplay — it duplicates resume content and doesn't serve the investigation.

## Data Model

### Source

Supabase project `supascribe-notes`, table `public.cards` (276 cards). Each card has:

```
objectID, title, blurb, fact, url, tags, projects, category, signal, created_at, updated_at, deleted_at
```

### Player-Visible Fields

- `title` — shown on evidence card
- `blurb` — shown on evidence card
- `category` — determines which room the card appears in

### Hidden Fields (server-side only)

- `fact` — the full context used for AI evaluation. NEVER sent to client.
- `tags` — hierarchical classification
- `projects` — project associations
- `signal` — relevance score (1-5), used for card selection (signal > 2)

### Client Game State

```
{
  session_id: string,
  claim: string,
  rooms_visited: string[],
  evidence: {
    proof: Card[],
    objection: Card[]
  },
  feed: FeedEntry[],
  verdict: 'accuse' | 'pardon' | null
}
```

Client state is not persisted. Traceability is handled by `suspicion.picks` and `suspicion.sessions` in Supabase.

## Claims System

### V1: Static Claims

A curated list of claims derived from index themes. One assigned randomly at session start — the player does not choose.

- "Ashley depends on AI too much"
- "Ashley avoids finishing projects"
- "Ashley values systems over people"
- "Ashley prioritizes speed over quality"
- "Ashley's experience is too narrow"
- "Ashley resists standard practices"

Each claim should have cards in the index that both support and undermine it.

### V2: AI-Generated Claims

The AI analyzes the index and generates a claim dynamically, ensuring sufficient evidence exists on both sides.

## Scoring / Evaluation

Each card pick produces an AI score from -1.0 to 1.0:

- **Sign** = direction: negative undermines the claim, positive supports it
- **Magnitude** = confidence: 0.1 is a shrug, 0.9 is a conviction

The score is not shown to the player. It drives The Architect's reactions and is logged to `suspicion.picks` for traceability. The player experiences the AI's judgment only through The Architect's theatrical commentary.

There is no player-visible score. No points. No leaderboard. The game is about the journey through the evidence and the cover letter it produces.

## Output: Cover Letter + Resume

### Cover Letter

Generated from the evidence actually collected during gameplay. Written by the AI in character as The Architect — stays in theatrical voice, does not shift to corporate professional tone. The cover letter:

- References only cards the player collected
- Highlights the themes those cards represent
- Does not require company/role context (this is a portfolio piece)
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
- Evaluation: receives full card data + claim, returns score (-1.0 to 1.0) + reaction
- Narrative: receives game state, returns Architect dialogue
- Cover letter: receives collected evidence + claim + verdict, returns letter in Architect's voice

### Background Images

Pre-generated industrial steampunk mansion backgrounds exist for each room. File naming convention: `{room-name}.jpg` (e.g., `attic.jpg`, `gallery.jpg`, `house-exterior.jpg`). The UI is designed around these images — they are the primary visual layer, not decoration.

## Design Principles

1. **Constraint generates meaning** — narrative tension emerges from structural rules, not scripted events
2. **Neutral judgments are forbidden** — players must commit (proof or objection, accuse or pardon)
3. **Information asymmetry** — the player sees title + blurb, the AI evaluates using `fact`. The gap is the game.
4. **Perspective invariance** — AI evaluation is tested through worldview shifts to verify score convergence
5. **Grid positions are sacred** — room names and positions match background images exactly

## Resolved Questions

1. **Name:** Architect of Suspicion (game), The Architect (AI persona)
2. **Card count per room:** 6 dealt, one replaced per pick from remaining pool
3. **Repeat visits:** Yes — player stays as long as they want, picks one at a time
4. **Evidence limit:** No hard cap. V2 tension system serves as soft pressure.
5. **Claim selection:** Random from static list (v1)
6. **About category:** Excluded from gameplay — duplicates resume content
7. **AI model:** Claude SDK (Anthropic)
8. **Data source:** Supabase, not Algolia
9. **Persistence:** Picks + verdict logged for traceability, no user accounts

## Open Questions

1. **Mobile:** Is this desktop-only given the mansion grid paradigm?
