# Security Best Practices Report

## Executive Summary

This review covered the SvelteKit + Supabase application runtime, focusing on request-facing server routes, session integrity, prompt-handling paths, and baseline web hardening controls.

I found **6 actionable findings**:
- **1 High** (session tampering risk via bearer-like `session_id` only)
- **3 Medium** (state integrity and abuse-resistance gaps)
- **2 Low** (defense-in-depth hardening gaps)

No evidence was found that server-only `fact` values or raw `ai_score` are leaked to the client in current route responses.

---

## High Severity

### [AOS-SEC-001] State-changing session APIs rely on `session_id` alone (no possession proof)

- Rule ID: `AOS-SEC-001`
- Severity: High
- Location:
  - `src/routes/api/evaluate/+server.ts:193`
  - `src/routes/api/evaluate/+server.ts:223`
  - `src/routes/api/generate-letter/+server.ts:140`
  - `src/routes/api/generate-letter/+server.ts:156`
  - `src/routes/verdict/+page.server.ts:5`
- Evidence:
  - `evaluate` accepts caller-supplied `session_id` and writes picks/attention for that session.
  - `generate-letter` accepts caller-supplied `session_id` and updates verdict/letter for that session.
  - Verdict pages load by `?session=<session_id>` in URL query params, making session identifiers easier to leak via copy/paste, logs, screenshots, or referrers.
- Impact: Anyone with a valid `session_id` can alter that session’s verdict, letter, and ongoing picks without additional proof-of-possession.
- Fix:
  - Keep anonymous play, but add a **capability token** per session.
  - On session creation, mint a high-entropy token, store only a hash server-side, and return token once to client.
  - Require token (for example `X-Session-Token`) on all state-changing endpoints and verify hash + session binding.
  - Keep `session_id` as locator only, not authorizer.
- Mitigation:
  - Expire inactive sessions.
  - Regenerate capability token when verdict is sealed.
- False positive notes:
  - If the product intentionally treats any holder of a session link as an editor, classify this as accepted risk and document that explicitly.

---

## Medium Severity

### [AOS-SEC-002] `evaluate` trusts caller-provided `claim_id` instead of binding to session claim

- Rule ID: `AOS-SEC-002`
- Severity: Medium
- Location:
  - `src/routes/api/evaluate/+server.ts:56`
  - `src/routes/api/evaluate/+server.ts:73`
  - `src/routes/api/evaluate/+server.ts:91`
  - `src/routes/api/evaluate/+server.ts:223`
- Evidence:
  - Endpoint accepts `claim_id` from request body.
  - Session lookup only loads `attention`, not `claim_id`.
  - Seed score lookup uses caller-provided `(claim_id, card_id)` pair.
  - Pick is then inserted into the caller-provided `session_id`.
- Impact: A crafted request can mix session state with a foreign claim/card pair, undermining game-state integrity and scoring semantics.
- Fix:
  - Remove `claim_id` from client contract for `/api/evaluate`.
  - Load `session.claim_id` server-side and derive claim context exclusively from session row.
  - Reject when session has no claim or card is not in that session’s claim deck.
- Mitigation:
  - Add integration tests covering cross-claim tampering attempts.
- False positive notes:
  - If all clients are assumed trusted (not realistic on public web), this is less exploitable but still a correctness/integrity defect.

### [AOS-SEC-003] `/api/narrate` accepts unbounded user-controlled prompt input

- Rule ID: `AOS-SEC-003`
- Severity: Medium
- Location:
  - `src/routes/api/narrate/+server.ts:32`
  - `src/routes/api/narrate/+server.ts:44`
  - `src/lib/server/prompts/narrate.ts:27`
  - `src/lib/server/prompts/narrate.ts:35`
- Evidence:
  - Validation checks type/enum for only some fields, but no length/size bounds on `claim`, `room`, or `rooms_visited` aggregate prompt content.
  - Prompt builder interpolates these values directly into LLM prompt text.
- Impact: Attackers can inflate prompt size and token spend, increasing cost and latency; this can be used for abuse/DoS even with rate limiting.
- Fix:
  - Enforce strict max lengths and list caps (for example claim <= 300 chars, room <= 40, rooms_visited length <= 12).
  - Validate `rooms_visited` element format against known slugs.
  - Enforce request body size limits at edge/runtime.
- Mitigation:
  - Use tighter rate limits specifically for LLM-backed endpoints.
- False positive notes:
  - If an upstream gateway already enforces tight body-size limits, residual risk is lower but still present in prompt-field validation.

### [AOS-SEC-004] Missing abuse controls on non-LLM endpoints (`/api/sessions`, `/api/cards`)

- Rule ID: `AOS-SEC-004`
- Severity: Medium
- Location:
  - `src/routes/api/sessions/+server.ts:11`
  - `src/routes/api/cards/+server.ts:12`
- Evidence:
  - `rateLimitGuard` is used in `/api/evaluate`, `/api/narrate`, and `/api/generate-letter` but not in session creation or card dealing.
- Impact: Session-row spam and deck-query flooding can increase database load and storage churn.
- Fix:
  - Apply route-specific throttling to `/api/sessions` and `/api/cards`.
  - Consider lower limits on session creation than on read routes.
- Mitigation:
  - Add edge-level rate limiting and request anomaly monitoring.
- False positive notes:
  - If Cloud Run/edge already enforces strict IP throttles, impact is reduced but still worth hardening in-app.

---

## Low Severity

### [AOS-SEC-005] Baseline security headers/CSP not visible in app server

- Rule ID: `AOS-SEC-005`
- Severity: Low
- Location:
  - `scripts/server.js:12`
  - `src/app.html:27`
- Evidence:
  - Server sets compression middleware only; no explicit CSP, `X-Content-Type-Options`, `Referrer-Policy`, or clickjacking protection headers are configured here.
  - App includes inline JSON-LD script; without explicit CSP strategy, future XSS blast radius remains higher than necessary.
- Impact: Reduced defense-in-depth against XSS/clickjacking/content-type confusion.
- Fix:
  - Add baseline headers at app or edge layer:
    - `Content-Security-Policy` (or explicit runtime note that CSP is set at edge)
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy`
    - `frame-ancestors` (via CSP) or `X-Frame-Options`
- Mitigation:
  - Verify effective headers with runtime integration checks in CI.
- False positive notes:
  - If headers are set by CDN/load balancer, classify this as “not visible in repo; verify runtime config.”

### [AOS-SEC-006] Rate-limit env parsing can silently disable limits on bad config

- Rule ID: `AOS-SEC-006`
- Severity: Low
- Location:
  - `src/lib/server/rateLimit.ts:12`
  - `src/lib/server/rateLimit.ts:13`
  - `src/lib/server/rateLimit.ts:68`
- Evidence:
  - `parseInt` results are used directly without finite/positive checks.
  - Misconfigured env (for example non-numeric strings) can produce `NaN`, making threshold comparisons unreliable.
- Impact: A deployment misconfiguration can effectively disable throttling.
- Fix:
  - Validate parsed values with `Number.isFinite` and enforce sane minimum/maximum bounds.
  - Fall back to secure defaults when invalid.
- Mitigation:
  - Add startup config validation and fail-fast for invalid rate-limit env values.
- False positive notes:
  - If deployment platform guarantees valid numeric env values, exploitability is lower, but code-level guard is still recommended.

---

## Additional Dependency Observation

- `pnpm audit --prod --json` reports one moderate advisory:
  - `postcss` `<8.5.10` (CVE-2026-41305 / GHSA-qx2v-qp2m-jg93)
- Current dependency path: `.>@sveltejs/kit>vite>postcss` (reported version `8.5.9`).
- This appears primarily build-tool related; validate whether any runtime CSS stringification path is exposed in production before prioritizing.

---

## Recommended Remediation Order

1. Implement session capability token flow (`AOS-SEC-001`).
2. Bind evaluation logic to session claim server-side (`AOS-SEC-002`).
3. Add strict prompt-input bounds and body-size limits (`AOS-SEC-003`).
4. Extend throttling to `/api/sessions` and `/api/cards` (`AOS-SEC-004`).
5. Add/verify baseline security headers and harden rate-limit config parsing (`AOS-SEC-005`, `AOS-SEC-006`).
