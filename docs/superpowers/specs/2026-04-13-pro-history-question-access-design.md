# Pro Subscription — Expanded History & Question Access

**Date:** 2026-04-13
**Status:** Approved
**Owner:** Emmanouil Kaparos

## Summary

Expand the Pro subscription with two new perks: (1) deeper match history (100 vs 10) and (2) post-match question review across Battle Royale, 2-Player, and Duel modes. Free users see locked/blurred surfaces with a single upsell modal that routes into the existing subscription flow.

## Goals

- Reward Pro subscribers with tangible post-match value.
- Gate both list depth and question content **server-side** so non-pro clients never receive question payloads.
- Reuse existing `profiles.is_pro`, `matches.detail_snapshot`, and `ProService.isPro` plumbing — no new tables.

## Non-Goals

- Backfilling questions for matches saved before `detail_snapshot` was introduced.
- Changing the subscription product, pricing, or entitlement system.
- Adding share/export of question breakdowns.

## Capabilities

### C1 — History Depth

- Free: last **10** matches.
- Pro: last **100** matches.
- Enforced by `MatchHistoryService.getHistory(userId)`, which resolves `is_pro` and passes `limit = isPro ? 100 : 10` to `SupabaseService.getMatchHistory`.

### C2 — Match-Detail Question Visibility

Applies to Battle Royale, 2-Player, and Duel match details.

- Pro: full question list with correct answers and the player's (or both players') answers.
- Free: the same surface renders in a locked state (blurred cells or collapsed section) and tapping opens a shared upsell modal.

### C3 — Backward Compatibility

Matches that predate `detail_snapshot` (no persisted questions) show a neutral empty state — "Questions not available for this match" — regardless of pro status. No live reconstruction attempt.

## Architecture

### Backend (NestJS)

**`MatchHistoryService.getHistory(userId)`**
- Load profile via `supabaseService.getProfile(userId)`.
- Call `getMatchHistory(userId, isPro ? 100 : 10)`.

**`MatchHistoryService.getMatchDetail(matchId, requestingUserId)`**
- Existing participant check unchanged.
- Resolve requester `is_pro`.
- If `!detail_snapshot` or `detail_snapshot.questions` absent/malformed → respond with `questionsAvailable: false`.
- If non-pro → strip `detail_snapshot.questions` (and per-player answer arrays) from the response; set `questionsLocked: true`.
- Pro + snapshot present → `questionsAvailable: true`, `questionsLocked: false`, questions included.

**Response contract additions (MatchDetail):**
- `questionsAvailable: boolean`
- `questionsLocked: boolean`

**Snapshot shape (normalized per mode):**
```ts
detail_snapshot.questions: Array<{
  id: string;
  text: string;
  correctAnswer: string;
  // 2-Player + Duel
  player1Answer?: string;
  player2Answer?: string;
  // Battle Royale (map of userId → answer)
  perPlayerAnswers?: Record<string, string>;
  wasCorrect?: boolean; // per requesting player, when applicable
  timeMs?: number;
}>
```

If any mode's `buildSnapshot` does not yet populate questions, extend it as part of implementation.

### Frontend (Angular)

- Reuse `ProService.isPro` signal for UI affordances.
- Trust the server: use `questionsLocked` / `questionsAvailable` from the response to pick the render branch (never assume the payload contains questions just because `isPro` is true).
- New shared component `<pro-upsell-modal>` with a single "Upgrade" action that routes to the existing subscription page, and a "Not now" dismiss.

### Per-Mode UI

**Battle Royale (`match-detail`)**
- New "Questions" section under the leaderboard.
- Pro: list of rows with `{ text, correctAnswer, yourAnswer, wasCorrect, timeMs }`.
- Free: 5 blurred skeleton rows + centered lock + "Unlock question review with Pro" CTA. Tap → upsell modal.

**2-Player (`match-detail`, `match-detail-modal`)**
- Answer-grid cells remain visible.
- Pro: cells tappable → bottom-sheet / popover with `{ text, correctAnswer, player1Answer, player2Answer }`.
- Free: tap → upsell modal. Small 🔒 badge on the grid header indicates the feature.

**Duel (`match-detail`)**
- Existing "question breakdown" section.
- Pro: fully expanded with per-question answers for both players.
- Free: collapsed to a single card with lock + CTA. Tap → upsell modal.

### Shared Upsell Modal

- Title: "Unlock Pro"
- Body: "See every question you played — upgrade to Pro."
- Actions: **Upgrade** (routes to existing `/pro` subscription page), **Not now**.

## Data Model

No migrations. Relies on:
- `profiles.is_pro` (boolean).
- `matches.detail_snapshot` (JSONB).

## Security

- Server strips `questions` before sending to non-pro clients. A client-only hide would let a free user sniff the API payload.
- Re-evaluates `is_pro` on every detail request; no server-side caching of stripped/unstripped variants.
- Existing participant-only authorization for match detail preserved.

## Error Handling & Edge Cases

- Non-participant requester → existing `ForbiddenException`.
- Malformed `detail_snapshot` → log + `questionsAvailable: false`.
- Pro revoked mid-session → next API call returns locked response; client re-renders accordingly.
- Battle Royale: if snapshot is missing per-player answers, still show the question + correct answer to Pro and omit `yourAnswer` gracefully.

## Testing

- **Backend unit (`match-history.service.spec.ts`):**
  - `getHistory` passes limit 10 for non-pro, 100 for pro.
  - `getMatchDetail` strips `questions` for non-pro and sets `questionsLocked: true`.
  - `getMatchDetail` sets `questionsAvailable: false` for matches without a snapshot.
- **Frontend component tests:** each of the three match-detail surfaces renders the locked state for free, content for pro.
- **E2E:** extend `e2e-game-sim.mjs` to assert question visibility differs by pro status on a simulated match detail fetch.

## Rollout

- Ship behind no feature flag — gated purely on `is_pro`.
- Verify each mode's `buildSnapshot` populates the normalized shape before enabling the UI entry points.

## Open Questions

None at spec time.
