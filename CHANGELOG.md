# Changelog

All notable changes to StepOver will be documented in this file.

## [0.8.8.2] - 2026-04-20

### Added
- **`backend/scripts/dedupe-pool-near-duplicate.ts`** (`npm run pool:dedupe-near`) — 3-layer near-duplicate cleanup targeting the Steaua-style case (same concept, different wording, slipped past exact-text dedup). Layer 1: pgvector cosine similarity under threshold (default 0.12, matches `find_near_duplicate_in_pool` RPC). Layer 2: NULL-safe taxonomy compatibility — rules out pairs where `subject_id`, `competition_id`, `event_year`, `concept_id`, or `answer_type` are both populated on either side and differ. This kills structural false positives like "Galatasaray in Istanbul" vs "Fenerbahçe in Istanbul" (different `subject_id`) or "Dortmund 2013 UCL" vs "Bayern 2012 DFB-Pokal" (different year + subject). Layer 3: Gemini YES/NO verdict on remaining pairs catches the subtler cases where taxonomy agrees but stats differ (e.g. Messi-80g-all-comps vs Messi-45g-La-Liga, same subject + year). Dry-run by default; keeps the oldest row per cluster. Layer breakdown on current pool: 419 pgvector candidates → 94 after taxonomy → LLM verdict pending. `--skip-llm` flag for aggressive taxonomy-only mode; `--threshold N`, `--category X`, `--no-same-answer` flags.

## [0.8.8.1] - 2026-04-20

### Fixed
- **Semantic dedup was silently letting duplicates into the pool** — root cause was a three-layer silent-failure chain: (1) `PoolSeedService.semanticDedup` caught `embedTexts` errors and returned candidates unchanged with no embedding attached, (2) per-item embedding failures from `LlmService.embedTexts` (rate limits, empty responses) pushed candidates with `_embedding=null`, (3) `persistQuestionsToPool` then wrote `embedding: null` to the DB. The `find_near_duplicate_in_pool` RPC filters `embedding IS NOT NULL`, so those null-embedding rows became permanent blind spots for every subsequent dedup check. Combined with bulk seed days (2026-03-28: 1116/1116 null, 2026-04-16: 566/566 null, 2026-04-17: 524/524 null), this accumulated to 2,775 of 4,366 rows (63%) with null embeddings and 32 exact-text duplicate clusters spanning 2,240 excess rows. Fix is defense-in-depth across three layers: `semanticDedup` now throws on batch embedTexts failure (force caller retry) and drops individual items with null per-item embedding; `persistQuestionsToPool` calls new `ensureEmbeddingsAndDedup` as a last-chance guard that embeds + dedup-checks any row bypassing `semanticDedup` (e.g. `takeClosestByRawScore` fallbacks); insert builder throws if any row still lacks `_embedding`, making null-embedding inserts structurally impossible.
- **`getExistingQuestionKeys` was blind to older rows** — previously capped at 200 most-recent rows per category. HISTORY alone has 639 rows, so exact-text dedup within a seed session silently missed anything older than the last 200. Now paginates up to 5,000 rows per category.

### Added
- **`backend/scripts/backfill-pool-embeddings.ts`** (`npm run pool:backfill-embeddings`) — backfills embeddings for the 2,775 historical null-embedding rows, restoring dedup coverage for the existing pool. Dry-run by default; `--apply` to write. `--category X`, `--limit N`, `--batch-size N` flags. Idempotent (only touches `embedding IS NULL` rows) so safe to re-run.
- **`backend/scripts/dedupe-pool-exact-text.ts`** (`npm run pool:dedupe-exact`) — finds clusters of rows with identical `(category, normalized question_text, normalized correct_answer)` and deletes all but the oldest per cluster (preserving the canonical id in case of analytics/ELO/gameplay references). Dry-run by default with full impact report; `--apply` to delete.

### Known follow-up
- **Near-duplicate dedup** (same concept, different wording — e.g. the 4 Steaua/Barcelona 1986 European Cup rows) is NOT caught by exact-text dedup. Requires a second pass using pgvector cosine distance against the `find_near_duplicate_in_pool` threshold (0.12). Not included in this fix — runs after the embedding backfill completes, so there's enough embedding coverage for pairwise comparison to make sense.

## [0.8.8.0] - 2026-04-20

### Added
- **Concept-driven seed steering** — new `backend/src/questions/steering/` module replaces the old "25 random questions to avoid" hint with a coverage-driven concept + entity steering layer. Before each `generateBatch`, `SteeringService.planBatch(category, difficulty)` aggregates `concept_id → count` from `question_pool` scoped to the category, picks ONE concept via `selectConcept` (weighted toward singleton coverage=1 and scarce 2–3 tiers, bans overused >10, per-difficulty weights push harder at EXPERT), fetches 1–2 sample questions of that concept as a concrete reference, and runs `selectScarcityTargets` against canonical entities filtered by the category's relevant types (e.g. `PLAYER_ID = players only`) to offer 8 underused entities as a soft focus hint. Motivation: pool analysis on 2026-04-20 showed 50–97% of concept_ids per category are singletons while the top 5 concepts dominate with 49–72 questions each — textbook LLM default-mode behavior that blind generation can't escape. Leans on the existing `QuestionIntegrityService` web-search verification to correct hallucinated answers in-flight rather than avoid them, so steering can push harder at obscure concepts without tanking yield.
- **`GeneratorBatchOptions.concept` and `.entityTargets`** — new optional fields threaded through all 7 batch generators (HISTORY, PLAYER_ID, HIGHER_OR_LOWER, GUESS_SCORE, TOP_5, GEOGRAPHY, GOSSIP). Injected into the user prompt as **primary** concept steer (CONCEPT FOCUS block — commits the whole batch to one concept shape) and **secondary** entity diversification hint.
- **`CATEGORY_ENTITY_TYPES` map** — per-category list of canonical entity types appropriate for steering. Prevents off-topic steering (no entity hints of `player` type when the concept is a stadium-location question).
- **33 unit tests** across 5 spec files — 15 for the pure selectors (tier bucketing, per-difficulty weight distributions, bucket-empty fallbacks, `recentlyTargeted` oscillation prevention, TOP_5 all-singleton case) plus 18 service-layer tests with a mocked `SupabaseService` covering: coverage aggregation correctness, fail-open behavior on Supabase errors, canonical-file-missing fallback, `recentConcepts` rolling-window invariants (10-entry cap, no oscillation), and a defense-in-depth test that injects an adversarial `display_name` with embedded markdown headers to verify `sanitiseForPrompt` strips them end-to-end.
- **Fixed a latent bug in `sanitiseForPrompt`** (`backend/src/questions/classifiers/canonical-entities.ts`) exposed by the defense-in-depth test: the order of operations was `collapse-newlines` → `strip-line-start-headers`, which meant a newline-embedded `## injection` payload got collapsed into the single-line form `"name ## injection"` BEFORE the `/^#+/gm` regex could strip it. Swapped the order so header-stripping runs first while `\n` boundaries still exist. Pre-existing and unused in practice (the current canonical file has no adversarial content), but would have bitten the moment someone seeded a malicious entry.

### Changed
- `PoolSeedService.seedCategoryPasses`, `seedSlotPasses`, and `fillCategoryUntilSatisfied` call `steeringService.planBatch(...)` INSIDE their retry loops. Fresh plan per retry → when duplicates cause retry, a different concept is picked via the 10-entry `recentlyTargeted` rolling window.
- `GENERATION_VERSION` bumped `3.0.2` → `3.1.0` — concept-steered rows are a distinct generation vintage for analytics/rollback.

### Architecture
- **Three-layer generation steering**: (L1) Concept commits the batch shape, primary/coercive. (L2) Entity scarcity hints underused subjects, secondary/soft. (L3) Pre-existing `QuestionIntegrityService` fixes hallucinated answers via `correctedAnswer` path — corrections > rejections.
- **Pure selector functions + NestJS orchestrator**: `selectConcept` / `selectScarcityTargets` are pure with RNG hooks for deterministic testing.
- **Client-side aggregation for coverage queries** — pool is <10k rows/category, cheaper than adding an RPC + migration. Trivial to swap to RPC if perf ever matters.
- **Fails open** — canonical entities missing, Supabase errors, or null coverage all degrade to "no steering" and generators fall back to the old prompt shape.

### Known follow-up
- **49% of question_pool rows have `concept_id = NULL`** (2,225 of 4,366 on 2026-04-20) — classifier missed half the pool. Steering works off the 51% with populated concepts (still thousands of signal rows) but a backfill script would bring coverage to 100%. Not blocking — ships separately.

## [0.8.7.0] - 2026-04-20

### Added
- **New `<app-answer-flash>` shared component** at `frontend/src/app/shared/answer-flash/` — real-time a11y + motion shell used by Blitz, Duel, and Battle Royale to surface in-flow correct/wrong banners. Complements `<app-question-reveal>` (the post-answer panel for Solo/Logo Quiz). Inputs: `correct: boolean`, `announcement: string`, `dismissible?: boolean`. Output: `dismiss`. Consumers provide their own visual content (emoji, colored backgrounds, text deltas) via `<ng-content>` — the component is intentionally NOT opinionated about visuals. What it DOES provide: `role="status" aria-live="assertive" aria-atomic="true"` on the wrapper, a visually-hidden `.sr-only` announcement span that reads the `announcement` input verbatim, consistent 200ms fade-in + scale entrance animation (respects `prefers-reduced-motion`), and optional tap-to-dismiss for overlay-style flashes. 4/4 specs pass in `answer-flash.spec.ts`.

### Changed
- **Adopted `<app-answer-flash>` across Blitz, Duel (opponent + my flash), and Battle Royale (×2 instances: logo + trivia modes)** — replaces 5 ad-hoc `<div role="status" aria-live="assertive">...</div>` wrappers with a single shared component. The previous pattern was 5 different copy-pasted implementations, which is exactly how PR #81 shipped a11y for one mode and PR #85 had to retrofit the other 5 separately. Centralizing into a shared shell prevents the next class of a11y drift: when we add a new mode with flash UI, it gets live-region + sr-only parity by default rather than "forgot again".
- **Consistent entrance motion across all real-time flashes.** Previously each mode had its own ad-hoc animation (some had `animate-pulse`, others had nothing, Blitz's overlay had no entrance animation at all). The shared component adds a subtle 200ms fade + scale from 0.96 → 1.0 on mount, giving every mode the same arrival feel. Consumers can still layer their own animations on top (Duel's opponent-flash keeps `animate-pulse`).

### Architecture
- The shared shell is a **slot component** — it contributes a11y + motion, consumers keep visual ownership. This avoids the design-prescription trap where one component tries to standardize both behavior AND appearance across modes that legitimately look different (Blitz uses a full-screen overlay with bg-win/95 overlay, Duel uses an inline colored panel, Battle Royale uses `.br-play__answer-flash` BEM styling). By shelling out only the behavior layer, each mode keeps its visual identity while sharing the invisible stuff.

### Depends on
- PR #85 (`fix/a11y-live-regions-all-modes`) for the global `.sr-only` utility. Merge #85 first so the shell's visually-hidden span has its clip-path CSS available.

## [0.8.6.4] - 2026-04-20
## [0.8.6.7] - 2026-04-20

### Changed
- **Mayhem result screen collapsed from 5 stacked boxes to 3 visual zones.** After each answer, `/mayhem` previously rendered: (1) a big result-badge box with emoji ✅/❌ + CORRECT/WRONG headline + answer reveal + explanation, (2) the 4-option grid with inline ✓ CORRECT / ✗ your pick tags, (3) a full bg-card score tile showing "Score X / Y", (4) the Next/See-Results button row, plus the progress bar on top. The badge box was a **triple-signal duplicate**: the emoji + text repeated the same correct/wrong state that the option-grid tags already conveyed, and the explanation was buried inside a filled card rather than sitting in its own quiet space. This PR removes the badge box entirely — the option grid IS the reveal signal now (with ✓ CORRECT / ✗ your pick tags carrying the state). The explanation moves to a quiet left-border quote below the options (no box, `border-l-2 border-border`, matches the pattern from PR #81's `<app-question-reveal>`). The score card collapses to a compact inline row (label on left, chip on right) instead of a full card tile. Next/See-Results buttons unchanged.
- Depends on PR #85 (a11y) for the global `.sr-only` utility. The existing `role="status" aria-live="polite"` announcement from PR #85 moved from the removed badge to the new outer wrapper that contains the options + explanation + score, so screen-reader parity is preserved.

### User impact
Mayhem's after-answer screen now takes ~30% less vertical space. Sighted users see one clear correct/wrong signal (the option tags) instead of three. Screen-reader users still hear the full announcement on reveal.

## [0.8.6.6] - 2026-04-20

### Changed
- **Screen reader users now hear every result across Blitz, Duel, Battle Royale, Mayhem, and Daily.** PR #81 added `role="status" aria-live="polite"` only to the shared `app-question-reveal` component, which serves `/solo` + `/logo-quiz`. The other five modes each render their OWN result UI (flash overlays, colored badges, inline icons) without live regions — so VoiceOver and TalkBack users heard silence on every reveal across 5 of the 7 game modes. This PR backports the announcement pattern to all five: visually-hidden `<span class="sr-only">…</span>` with explicit "Correct." / "Wrong. The correct answer is X." text, wrapped in `role="status" aria-live="polite"` (or `assertive` for time-critical flash overlays in Blitz, Duel, Battle Royale where the user might dismiss before polite announces). Visual elements (emoji, colored badges, score deltas) are now `aria-hidden="true"` so screen readers don't double-announce or read the decorative glyphs.
- **New global `.sr-only` utility** at `frontend/src/styles/base/_a11y.css` — standard clip-path pattern, registered in the 7-1 styles index so every component can use it without redefining. Replaces the inline `.qr__sr-only` scoped to question-reveal (kept for now since it's in a separately-scoped component stylesheet, harmless duplication).

### User impact
Players with visual impairments using VoiceOver (iOS) or TalkBack (Android) now get audible feedback when they answer a question in any mode, not just Solo Ranked. Previously: silence after every answer except in Solo/Logo Quiz. Now: full parity across the 7 game modes.

## [0.8.6.5] - 2026-04-20

### Fixed
- **"AS Roma" now matches stored answer "Roma" in Solo Ranked (and every text-answer mode).** User typed "as roma" in a PSV Eindhoven question where the stored answer was "Roma" and it was marked wrong. Same class of bug affected "fc bayern" → "Bayern", "real madrid cf" → "Real Madrid", "arsenal fc" → "Arsenal", and any football team where the user types the fuller official name than what the LLM stored. Root cause in `backend/src/questions/validators/answer.validator.ts:validateFuzzy`: the existing fuzzy match handled submitted-is-a-PREFIX-of-correct ("inter" for "Inter Milan") and submitted-is-the-last-word-of-correct ("milan" for "Inter Milan"), but not the reverse: submitted wraps qualifier words around correct. For single-word correct answers like "Roma" the `parts.length > 1` branch never fired, so the submitted-contains-correct case fell through entirely. The LLM judge at `fuzzyScore=0.57` could have saved it but the 2-second timeout was too tight and the LLM frequently returned "no" when asked to literally-match "as roma" against "Roma". Fix adds a reverse-prefix rule: if the normalized correct answer appears as a whole-word substring of the submitted (guarded by short qualifier constraint — extra words must average ≤4 chars, ≤2 extra words total), accept. Also widened `JUDGE_TIMEOUT_MS` from 2000 to 3500 so the LLM backstop is less flaky on slower network paths.
- **Regression-tested** with 9 new cases in `answer.validator.spec.ts` covering AS Roma, FC Bayern, FC Bayern Munich, Real Madrid CF, AC Milan, Arsenal FC, plus guards against "CF" alone matching Real Madrid and sentence-length submissions matching on their last word. 82/82 specs pass.
## [0.8.6.4] - 2026-04-19

### Changed
- **Collapsed `entity_slugs` + `tags` into a single `tags` field on `question_pool`.** v0.8.6.2 introduced a generated `entity_slugs TEXT[]` column alongside the existing LLM-written `tags TEXT[]` to give entity-scoped modes a single-field filter. User feedback: the two fields were confusing, and empirical verification confirmed `tags ⊆ entity_slugs` holds on 100% of rows (0 violations across 1,950 tagged rows) — the separate `tags` column was query-redundant. Migration `20260615000000_collapse_entity_slugs_into_tags.sql` backfills `tags` to equal the current `entity_slugs` union, drops the generated column, and reindexes. Classifier writes (`pool-seed.service.ts:731`, `backfill-pool-taxonomy.ts:260`) now compute the full union (`subject_id + competition_id + nationality + LLM secondaries`) directly before inserting/updating, making the classifier the sole source of truth for `tags`. Downstream queries against `entity_slugs` must migrate to `tags` (zero such queries exist today — the column was added only 2 commits ago, not yet consumed by app code). Trade: gives up the Postgres-GENERATED invariant in exchange for schema clarity; acceptable because the only writers are the two classifier sites above and neither mutates scalar fields (subject_id/competition_id/nationality) independently of tags. GIN index on new `tags` preserves query performance.

## [0.8.6.3] - 2026-04-19

### Fixed
- **Repo↔Supabase migration sync restored.** Migration `20260418203808_daily_records_feature` had been applied to prod directly (via MCP `apply_migration`) but the SQL file was never committed to the repo, causing every subsequent `supabase db push` to fail its local-vs-remote sync check. Reconstructed the file from `supabase_migrations.schema_migrations.statements` (solo_session_summaries table + RLS policies + 6 app_settings keys + records_current materialized view covering streak_king / precision_solo / climber_solo / logo_hunter / logo_precision / duel_champion / logo_duel_champion / unique index on (record_type, window_type) + refresh_records_current() SECURITY DEFINER function). Entire migration is idempotent (`IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT DO NOTHING`) so re-running against prod is a no-op — `supabase db push` will now succeed cleanly for future migrations. Surfaced during v0.8.6.2 rollout when the dry-run blocked on the missing version. Root cause is the "Dashboard SQL or direct-MCP without committing the file" drift class documented in `feedback_run_migrations.md`; future migrations should always land as `db push` OR `MCP apply_migration + commit the .sql file` — not one without the other.

## [0.8.6.2] - 2026-04-19

### Added
- **`question_pool.entity_slugs` generated column for entity-scoped future modes.** Unlocks single-slug filtering for upcoming "Chelsea quiz", "Drogba quiz", "UCL quiz", "Argentine players quiz" without touching the classifier or backfilling tables. Generated as `array_remove(subject_id ∪ competition_id ∪ nationality ∪ tags, NULL)` and indexed with GIN — turns the old 4-field OR query (`subject_id = 'chelsea' OR 'chelsea' = ANY(tags) OR ...`) into `'chelsea' = ANY(entity_slugs)`. Nationality is unioned in deliberately: the canonical list keeps country slugs (`ar`) distinct from national-team slugs (`argentina`), so "Argentine players" and "Argentina NT" stay separable. Migration: `supabase/migrations/20260614000000_add_question_entity_slugs.sql`. No classifier/app code changes required — Postgres recomputes the column on row write, and existing rows are populated at migration time (`ALTER TABLE` rewrite). Apply via `supabase db push`. Rows with `subject_id IS NULL` produce an empty `entity_slugs` array; run `pool:backfill-taxonomy -- --resume --apply` separately to close that gap.

## [0.8.6.1] - 2026-04-19

### Changed
- **Question reveal state redesigned: 8 stacked boxes → 3 visual zones.** The post-answer screen on `/solo` + `/logo-quiz` previously piled up a glass-pill header wrapper, a WRONG badge, the question card, the red-bordered user input, a green correct-answer card, an explanation paragraph, a red -ELO box, and a blue NEXT button, for a total of eight bordered rectangles competing for attention. The new design collapses this into the question card + a new unified reveal block + the primary CTA, and replaces the three redundant wrong-signals (badge + red input + red ELO) with a single narrative: the user's wrong answer renders struck-through in a red card, a morph-gradient connector bridges down (red → green vertical gradient, ~2px pill-bar sweeping scaleY 0→1 in 450ms), and the correct answer lands in a green card with the ELO delta inlined as a compact chip on the same row. The explanation becomes a quiet left-border quote (no box). Correct-answer flow uses a compact single-row confirmation instead of the two-zone card. `prefers-reduced-motion` disables the connector sweep.
- **Extracted shared `<app-question-reveal>` component** at `frontend/src/app/shared/question-reveal/`. Two render modes: `text` (CLASSIC / LOGO_QUIZ / PLAYER_ID / GUESS_SCORE — full strikethrough pair) and `options` (MULTIPLE_CHOICE — footer-only, since the MC option grid already conveys correct/wrong inline). Staggered entry animations (answer-pair 0ms → correct-answer 100ms → explanation 200ms → CTA 300ms) remain identical across all question categories, so the end-of-question feel is unified across /solo and /logo-quiz. Blitz and Duel (which ship their own question UIs) can adopt the same component later for cross-mode consistency.
- **Orphan header wrapper removed from `<app-game-question>`.** The `.gq__header` container's backdrop-filter glass-pill (padding, 1rem border-radius, gradient bg, 1px border, 16px blur) wrapped only two small pills (mode + difficulty) on the reveal screen, creating a visually empty container. Stripped the wrapper chrome, kept the flex layout and `:root:not(.dark)` light-mode override is gone too. Pills now sit flat in flow for lighter hierarchy.
- **Screen reader users now hear the reveal result announced.** The previous design had `role="alert"` on the CORRECT/WRONG badge, which was removed when the badge was collapsed into the new reveal block. Added `role="status" aria-live="polite" aria-atomic="true"` on the `<app-question-reveal>` container plus a visually-hidden "Correct." / "Wrong. The correct answer is X." announcement span, so VoiceOver and TalkBack users get parity with sighted users. Regression-tested via `question-reveal.spec.ts`.

## [0.8.6.0] - 2026-04-19

### Fixed
- **Solo Ranked and Blitz rendered an empty screen after "Start Playing" — the question card never appeared.** Root cause in the shared `<app-screen>` primitive: `screen.html` had two default `<ng-content>` slots, one in each branch of the `@if (mode() === 'padded') / @else` block. Angular's content projection resolves slot → content at **template compile time**, not at runtime — when two `<ng-content>` tags share the same selector (default), only one wins, the other is permanently dead. Whichever branch Angular picked as "the" default slot, the other mode's consumers lost their projected children entirely. On `/solo` and `/blitz`, that meant the padded-mode body projection was the dead slot: signals were correct (`phase === 'question'`, `currentQuestion` populated, timer ticking), but `.screen__body` rendered with zero child nodes — not even @if anchor comments. Fix: gave padded-mode body an explicit named selector `<ng-content select="[screen-body]">`, left the bleed `<ng-content>` as the default, and wrapped the game-content `@if` blocks in both `solo.html` and `blitz.html` with `<ng-container ngProjectAs="[screen-body]">` (zero DOM cost, no layout drift). Bleed lobby untouched. Verified on dev: solo START PLAYING → question card + timer + input all render; blitz START → timer + 4 choices all render; `.screen__body` now projects 9 (solo) / 4 (blitz) child nodes. Regression introduced by #62 (`fbd7bb6`) which first extracted the `<app-screen>` primitive.

### Hardened (adversarial `/review` pass)
- **Dev-mode assertion in `ScreenComponent`.** Added `ngAfterViewInit` that warns (dev only) when `<app-screen mode="padded">` renders with no projected body content. Named-slot projection silently drops unwrapped children — this catches the next contributor who forgets `<ng-container ngProjectAs="[screen-body]">` before they ship an empty screen to users. Zero prod cost.
- **Regression test** `screen.spec.ts` with 3 specs locking in the contract: padded-mode body projects through the named slot, bleed-mode body projects through the default slot, and unwrapped padded-mode content is intentionally dropped. Any future refactor that regresses the projection pattern breaks a test instead of silently emptying /solo + /blitz again.
- **a11y — focus management on solo `finished` phase.** When the phase transitions `question → finished`, focus now moves to the session-complete `<h2>` (`tabindex=-1`, `#finishedHeading` ViewChild + effect + `queueMicrotask` for post-render focus). Before this fix the projection bug meant the finished UI never rendered for real users, so the focus gap was latent. Surfaced by the adversarial review that flagged the now-activated code path.
- **Inline bleed-branch comment** in `screen.html` explicitly forbids adding a second default `<ng-content>` anywhere in the template so this bug class can't resurface.

## [0.8.5.10] - 2026-04-19

### Fixed
- **`/news` anon sign-in regression introduced by v0.8.5.8.** The earlier fix skipped the AuthGuard-only `getQuestions()` call for anonymous visitors to silence the 401 log, but that 401 was load-bearing — `error.interceptor.ts:26-27` catches `status === 401` and calls `authModal.open()`, which was the *only* sign-in affordance for anon users on `/news` (the `empty` phase template has just a "Back to Home" button). Silencing the log also silenced the sign-in modal. Now the `!auth.isLoggedIn()` branch explicitly calls `authModal.open()` before dropping into `empty`, restoring the CTA deliberately rather than relying on an error-side effect. Surfaced by the `/review` adversarial pass.
- **Battle-hero dead-button edge: `mode.locked === true && mode.trialRemaining === 0` made the button fully non-interactive (no click handler, no sign-in modal).** v0.8.5.5 bound `[disabled]` to `mode.trialRemaining === 0` alone, so any mode that was BOTH locked AND trial-exhausted lost its click path. Tightened the binding to `[disabled]="!mode.locked && mode.trialRemaining === 0"` — locked buttons stay clickable (they open the sign-in modal via `lockedModeClick`), only the genuinely-exhausted-and-logged-in case disables. Rare edge state but a strict regression; surfaced by the `/review` adversarial pass.

## [0.8.5.9] - 2026-04-19

### Fixed
- **Branding case sweep — the rest of "Stepover" → "StepOver".** v0.8.5.1 fixed the HTML `<title>` + OG/Twitter meta, but the pre-landing review caught remaining surfaces that real users see on native and on legal pages. Swept: `frontend/public/manifest.webmanifest` (`name` + `short_name` — shown as the home-screen label on Android PWA/TWA installs), `frontend/src/app/features/legal/privacy.html` (3 user-facing mentions), `frontend/src/app/features/legal/terms.html` (9 user-facing mentions), `frontend/src/app/shared/page-header/page-header.html:19` (screen-reader alt text), and `frontend/src/app/shared/battle-hero/battle-hero.ts:25` (default subtitle, also updated "8-Player" → "20-Player" to match v0.8.5.2). Left untouched intentionally: `stepover_sound`/`stepover_haptic` localStorage keys (lowercase key convention) and `stepover-logo-white-bg.png` asset filename (filesystem convention). Surfaced by the /ship pre-landing review (informational finding escalated to auto-fix).

## [0.8.5.8] - 2026-04-19

### Fixed
- **`/api/news/mode/questions` logged a 401 for every anonymous visitor and raced signed-in users on cold loads.** `news-mode.ts:loadRound` unconditionally called `newsApi.getQuestions()` whenever `metadata.round_id && metadata.questions_remaining > 0`. The backend route is `@UseGuards(AuthGuard)` (`news.controller.ts:55-58`), so anonymous visits always 401'd, and signed-in users who landed on `/news` before Supabase restored the session from storage also 401'd (their `accessToken` signal was `null` at request time). Two fixes in `loadRound`: (1) `await this.auth.sessionReady` before any fetches so auth-dependent calls always see the restored session; (2) guard `getQuestions()` with `if (!this.auth.isLoggedIn()) { set 'empty'; return; }` so anonymous visitors fall through to the existing empty state cleanly — the auth modal overlay is the correct gate for anon users, not a background 401. Re-verified via `/qa`: anonymous load on `/news` now shows `/api/news/metadata → 200` with no follow-up `/mode/questions` call. Surfaced by full-app `/qa` (ISSUE-001, 2026-04-19).

## [0.8.5.7] - 2026-04-19

### Fixed
- **Duel lobby H2H stats inflated with local and online 2-player games.** `duel-lobby.ts:loadWinStats` reduced `matchHistory.getHistory(userId)` while only excluding `match_mode === 'battle_royale'`. The `match_mode` enum (`match-history.controller.ts:21`) is `'local' | 'online' | 'duel' | 'battle_royale' | 'team_logo_battle'`, so local same-device 2-player games, online 2-player board games, and team_logo battles all counted toward the 1v1 Duel H2H card. QA account showed "2W · 7D · 1L · 20% H2H WIN RATIO" on `/duel` even though 11 of the 13 underlying matches were `match_mode='local'`. Flipped the filter to an allowlist: `m.match_mode !== 'duel' → skip`. Now only actual online Duels count. Surfaced by full-app `/qa` (ISSUE-008, 2026-04-19).

## [0.8.5.6] - 2026-04-19

### Fixed
- **Malformed Apple-logo SVG path triggered a console parse error on every sign-in modal render.** `auth-modal.html:117` shipped a hand-tweaked Apple glyph whose second subpath (`M11.395 2.754c…2.679-1.49z`) contained 26 relative coordinates after the cubic `c` command. `c` requires groups of 6, so the renderer parsed four full curves, got two stray numbers (2.679, -1.49), then hit `z` where it expected another number and logged `<path> attribute d: Expected number, "…-.705 2.679-1.49z"`. The visual output rendered close enough to look correct, but every open of the auth modal added another console error. Replaced the path with the canonical Simple Icons Apple glyph (`viewBox="0 0 24 24"`, fully validated) — the rendered size stays at 18×18 via the explicit `width`/`height` attributes. Surfaced by full-app `/qa` (ISSUE-005, 2026-04-19).

## [0.8.5.5] - 2026-04-19

### Fixed
- **Logo Quiz mode buttons advertised `aria-disabled="true"` while still being clickable.** On the home Logo Quiz hero, the Duel 1v1 and Team PvP buttons render with `battle-hero__mode-btn--locked` when logged out and fire `lockedModeClick` → open the sign-in modal. This is correct behavior (the button IS actionable via the sign-in path), but `aria-disabled="true"` told assistive tech the opposite. Removed the `aria-disabled` binding for the locked state — the existing `aria-label` already spells out " - Sign in to unlock" so screen readers know what tapping does. For the "trial exhausted" state (`trialRemaining === 0`) the button has no meaningful click path, so replaced `aria-disabled` with the native `disabled` attribute, which short-circuits the click and implicitly sets `aria-disabled` for a11y. `battle-hero.ts:onModeClick` already skipped emitting `modeClick` when `trialRemaining === 0`, so the native-disabled change is defense-in-depth, not a behavioral flip. Surfaced by full-app `/qa` (ISSUE-006, 2026-04-19).

## [0.8.5.4] - 2026-04-19

### Fixed
- **`IapService` browser-mode warning spammed the console on every upgrade-modal open.** `initialize()` checked `if (this.initialized()) return;` before doing anything, but the browser-mode early-return at `:57-59` emitted the warning and bailed without ever setting `initialized.set(true)`. `upgrade-modal.ts:37-39` calls `iap.initialize()` every time the paywall opens when `!initialized()`, so each open produced a fresh `"cordova-plugin-purchase not available (browser mode)"` warning — /qa captured 30+ entries in a single session. Now set `initialized.set(true)` in the browser-mode branch so the warning fires exactly once. Callers who need to know whether IAP actually works already check `products().length` or fall back to hardcoded prices (`upgrade-modal.ts:57-58`), so flipping `initialized()` in browser mode is safe. Surfaced by full-app `/qa` (ISSUE-007, 2026-04-19).

## [0.8.5.3] - 2026-04-19

### Fixed
- **Casual NEWS card labeled "HOURLY" but content is daily.** `language.service.ts:258` had `newsDailyBadge: 'HOURLY'` (the key itself hints at the intent drift), and `btnNewsHint` read "Latest football headlines • Hourly updates". The `/news` route says "New questions drop **daily** from the latest football headlines" and the countdown is ~13h (time-to-midnight). Changed the badge to `'DAILY'` and the hint to "Daily updates" so all three surfaces agree. Surfaced by full-app `/qa` (ISSUE-003, 2026-04-19).

## [0.8.5.2] - 2026-04-19

### Fixed
- **Home "Battle Royale" card advertised 8 players; actual room size is 20.** `battle-royale.service.ts:222` hardcodes `maxPlayers: 20` and the `/battle-royale` lobby subtitle already said "20 players · 10 questions · Live leaderboard" — only the home `<app-mode-card>` was stale. First-time users tapped in expecting 8 and hit a 20-player lobby. Updated `home.html:49-50` (hint + tag label) and `tag-colors.ts:16,35` (color/icon keys) so the single home card now matches the rest of the app. Surfaced by full-app `/qa` (ISSUE-002, 2026-04-19).

## [0.8.5.1] - 2026-04-19

### Fixed
- **HTML `<title>` case: "Stepover" → "StepOver".** Browser tab, bookmark text, Open Graph title, and Twitter card title all inherited from `frontend/src/index.html` rendered the brand with a lowercase middle "o", contradicting the canonical "StepOver" casing used everywhere else in the app. Corrected across five locations in the same file. Surfaced by the full-app `/qa` pass (ISSUE-004, 2026-04-19).

## [0.8.5.0] - 2026-04-19

### Added
- **Battle Royale player ranks in lobby.** Each player in the BR waiting lobby now displays their global ELO rank as a `#N` badge next to their name. Mode-aware: classic BR rooms show solo ELO rank (`getSoloRank`), team_logo rooms show logo-quiz ELO rank via the new `getLogoQuizRank(userId)` in `supabase.service.ts`. Backend enrichment is per-player via `Promise.all` against the existing 60s Redis-cached rank functions, so 8–20 players costs at most one fresh DB count per player on cold cache. New `profileRank?: number | null` field on `BRPlayerEntry` (kept separate from in-room `rank` to preserve live-leaderboard semantics); `null` means the player is unranked in that mode (e.g. zero logo games played) and the badge is hidden. Refactored existing `getLogoQuizLeaderboardEntryForUser` to delegate to `getLogoQuizRank` so there is a single source of truth for logo rank computation.

### Fixed
- **Logo-quiz rank cache invalidation gap.** `logo-quiz.service.ts` now invalidates `rank:logo:{userId}` after a logo-quiz answer commit, mirroring `SupabaseService.updateElo`'s existing solo-rank invalidation pattern. Without this fix, BR Logo lobby badges showed stale rank for up to 60s after a player finished a logo game. Hardcore-mode invalidation deferred until `getLogoQuizHardcoreRank` exists. Surfaced by the `/ship` pre-landing review.
- **Battle Royale rank lookup observability.** `getRoom` enricher's `.catch(() => null)` now logs `Logger.warn` so a Redis outage or Supabase 500 surfaces as a structured warning rather than silently rendering players as "unranked." Genuinely-unranked players still produce no log line.
- **4 pre-existing test failures** that had been silently broken on `main`. None caused by the rank-display work; surfaced by `/ship`'s test triage and fixed inline so the suite returns to fully green (234/234 backend, 20/20 frontend).
  - `online-game.service.spec.ts`: `SupabaseService` mock missing `saveMatchResult`. Added `jest.fn().mockResolvedValue(true)`.
  - `llm.service.spec.ts`: NestJS DI failed because the test module didn't provide `RedisService` (LlmService injects it). Added a stubbed provider.
  - `mayhem.service.spec.ts`: NestJS DI failed because the test module didn't provide `MayhemStatGuessGenerator`. Stubbed as `{ generate: jest.fn().mockResolvedValue([]) }`.
  - `app.spec.ts`: scaffold-leftover test still checked for the `ng new` placeholder `<h1>Hello, football-quizball-frontend</h1>` and built `App` without `HttpClient` / router providers (App uses `ConfigApiService`). Rewritten to provide `provideRouter([])`, `provideHttpClient()`, `provideHttpClientTesting()` and assert that `<router-outlet>` renders.

### Removed
- **Dead `supabase/*.repository.ts` files (≈643 LOC).** `elo.repository.ts`, `leaderboard.repository.ts`, and `profile.repository.ts` were registered as Nest providers in `supabase.module.ts` but never injected anywhere — every method duplicated one already on `SupabaseService`. Likely abandoned mid-refactor (split-the-god-service plan that never landed). Files deleted; module providers/exports trimmed to just `SupabaseService`. Verified zero callers across `backend/src` before deletion.

### Why "Quick Join" stays hidden in BR Logo mode
- Investigated user-reported asymmetry: classic BR exposes Quick Join, team_logo BR does not. **This is intentional, not a bug.** Three layers gate it (`battle-royale-lobby.html:109` `@if (!isTeamLogoMode())`, `battle-royale-lobby.ts:54` skips public-room polling, and `battle-royale.service.ts:129` hardcodes `joinQueue` to `.eq('mode', 'classic')`). The product call is that team-vs-team play depends on balanced sides — random matchmaking would frequently produce 1v3 splits — so team_logo is invite-only. Documented here for future archeology; no code change.

## [0.8.4.3] - 2026-04-19

### Fixed
- **Battle Royale "Failed to load room" after leaving as last player.** When the last player left a BR room, the room was destroyed (correct) and the user was redirected to `/battle-royale` (correct), but the destroyed `/battle-royale/:id` URL was pushed onto browser history. Pressing back returned to that dead URL, re-invoked `BattleRoyalePlayComponent.ngOnInit()` → `store.loadRoom()`, which 404'd and parked the user on a generic "Failed to load room" error card. Two complementary fixes: (1) `battle-royale-play.ts:leaveRoom()` now navigates with `replaceUrl: true` so the destroyed game URL is replaced in history instead of pushed on top, and (2) `battle-royale.store.ts:loadRoom()` now distinguishes 404 from other errors — on 404 it surfaces a "This room no longer exists" message for 2s then redirects to the lobby with `replaceUrl: true`, mirroring the existing `refreshRoom()` 404 handler at `:91-98`. Defends against the bookmark / forward-nav / shared-link cases too.

## [0.8.4.2] - 2026-04-18

### Removed
- **`question_pool.mode_compatibility` column dropped.** Introduced in the taxonomy PR (#59, 2026-04-16) as an optional array describing which game modes a question was safe to draw for. The classifier prompt told Gemini the field was optional and "empty is fine" (`question-classifier.service.ts:199`); the LLM obliged, `pool-seed.service.ts:727-729` coerced empty arrays to `NULL`, and **1091 / 1092** new rows (99.9%) ended up `NULL`. Confirmed no read path depended on it — zero RPCs, views, analytics, or frontend references. Product decision is that taxonomy powers user-facing analytics ("top X% on UCL questions"), not mode routing, so the field is not needed. Cleaner to drop than to repair a prompt we don't want. New migration `20260418201736_drop_mode_compatibility.sql` drops the column + GIN index; classifier output type, system prompt, Raw type, validator branch, `GameMode` + `ALLOWED_MODES` consts, pool-seed writer, and backfill display/write are all removed. Applied to prod Supabase on 2026-04-18; Railway cron temporarily paused (`DISABLE_POOL_CRON=1`) to prevent old main code from crashing against the now-missing column. Flip back to `0` after this PR merges + Railway redeploys.

## [0.8.4.1] - 2026-04-18

### Fixed
- **Landing page 404s.** All 16 landing assets (logomark, 6 mode icons, 2 store badges, hero phone, 5 screenshots) were 404ing because they lived under `frontend/src/assets/landing/` but `angular.json` only declares `public/` as the static-asset input. Moved the folder to `frontend/public/assets/landing/` so the existing `assets/landing/...` references in `landing.html` resolve. The 6 PNGs (hero-phone, screenshot-1..5) that were `.TODO` sentinels are now real images generated via Vertex AI; replace with real gameplay captures before production launch.

### Added
- **Landing-asset Vertex generator.** New `backend/scripts/vertex-generate-landing-assets.js` mirrors the pattern of `vertex-generate-game-bg.js`. Idempotent (skips existing PNGs unless `--force`), sharded (`--only <name>` regenerates one asset at a time), writes directly to `frontend/public/assets/landing/` and clears the matching `.TODO` sentinel on success. Prompts describe UI as shape-language with no readable text to sidestep the image model's garbled-glyph failure mode.

## [0.8.4.0] - 2026-04-18

### Added
- **CI build gate.** New `.github/workflows/ci.yml` runs `nest build` + `ng build --configuration production` on every PR and push to `main`, using Node 22 with per-lockfile caching. Replaces the prior no-gate auto-deploy where a broken build could hit Railway/Vercel directly. Does not yet run test suites (opt-in follow-up).
- **Remote feature-flag / kill-switch.** New `GET /api/config/feature-flags` endpoint reads `app_settings.feature_flags` and merges user overrides with defaults, with a runtime type guard against malformed admin writes. Frontend consumes via `ConfigApiService.loadFeatureFlags()` as a signal, wired into app bootstrap. Lets us disable a broken mode on shipped native builds by upserting a row in Supabase — no store re-review. Defaults to everything enabled so misconfigured or empty `app_settings` is safe.
- **Universal Links + App Links scaffolding.** `frontend/ios/App/App/App.entitlements` declares Sign in with Apple + `applinks:stepovr.com` associated domains. `AndroidManifest.xml` adds an `android:autoVerify="true"` intent-filter scoped to `/join`, `/duel`, `/battle-royale`, `/logo-quiz` path prefixes so marketing URLs stay in the browser. `frontend/public/.well-known/apple-app-site-association` + `assetlinks.json` shipped with TODO placeholders for Apple Team ID and SHA-256 cert fingerprint. `vercel.json` excludes `/.well-known/*` from the SPA rewrite and sets `Content-Type: application/json` on `apple-app-site-association`.
- **Username moderation.** New `backend/src/profile/username-moderation.ts` with a curated reserved-patterns list (admin/support/staff/official + brand impersonation covering stepov/stepovr/stepove/stepover) and a seed slur deny-list using normalized leetspeak matching. Wired into `PATCH /api/profile/username` alongside a `@Throttle(5/hr)` decorator to cap impersonation spam.
- **Sentry setup guide.** New `docs/sentry-setup.md` — complete backend + frontend wire-up instructions intentionally deferred from code so builds don't break until `@sentry/nestjs` + `@sentry/angular` are installed.
- **Age-rating submission guide.** New `docs/age-rating-submission.md` documents the exact App Store Connect and Google Play IARC questionnaire answers to land StepOver at a defensible 12+/Teen rating under Path A (rate app 13+ + disclose in ToS, no in-app age gate). Cross-checked against existing `terms.html` §3 and `privacy.html` §9 which already declare the 13+ requirement.
- **Signup legal footer.** Added a muted legal footer to `auth-modal.html` with links to `/terms` and `/privacy` and an explicit "You must be 13 or older to use StepOver" notice. Belt-and-suspenders against the ToS claim; copy is mode-neutral so it reads correctly on both Sign In and Sign Up tabs.

### Changed
- **Stale `pre-production.md` bundle-ID references corrected.** Three `com.stepover.app` occurrences updated to `com.stepovr.app` to match the actual iOS bundle ID / Android package name used everywhere in the code.

## [0.8.3.0] - 2026-04-17

### Added
- **Marketing landing page at `/` behind `environment.landingMode` flag.** New `LandingComponent` (`frontend/src/app/features/landing/`) renders a 6-section marketing page (hero, feature grid, screenshots, how-it-works, final CTA, footer) with device-aware App Store / Play Store CTAs via a pure `detectPlatform()` UA utility. When `landingMode` is `true` in `environment.prod.ts`, the app swaps from the full routes array to a landing-only routes array — `/`, `/terms`, `/privacy` resolve; every other path redirects to `/`. When `landingMode` is `false` (dev default), everything behaves as before. Launch-day cutover is a single boolean flip plus replacement of placeholder store URLs and assets. iOS smart-banner meta tag (`apple-itunes-app`) added to `index.html`; Android `related_applications` array added to `manifest.webmanifest` (informational only). `prefer_related_applications: true` is intentionally deferred to launch day — activating it now would surface a broken install banner to current Android web-app users since the Play Store listing does not yet exist. Visual direction is "Hybrid" — dark background, gold-glass accent panels matching the in-app Pro Arena vocabulary, but marketing-scale typography (hero H1 72px desktop / 44px mobile) and 96px section padding on desktop. All static copy lives in `content.ts` to keep the template lean. Unit tests assert all 6 sections render, feature grid has exactly 6 cards, how-it-works has exactly 3 steps, footer links resolve to `/terms` and `/privacy`, and both store URLs come from `environment.stores`. Placeholder assets and store URLs are marked with `TODO` and `.TODO` sentinel files so the launch checklist can grep-verify readiness.

## [0.8.2.2] - 2026-04-17

### Fixed
- **Stacking-context regression in `app-game` fixed before it could trap in-game modals.** `v0.8.2.0`'s `game.css` used `isolation: isolate` on `.game-shell` to confine the floodlit-BG `::before`/`::after` pseudo-elements below z:0 content. That created a new stacking context, which trapped any descendant overlay — specifically `<app-confirm-modal>` inside `<app-board>` (z:100) — at `.game-shell`'s z:auto level in the root context. The fixed `.bottom-nav` at z:40 in root would then paint over the bottom portion of the end-game confirm modal, occluding its action buttons. Dropped `isolation: isolate`; the BG pseudos at z:-2/-1 now render in the body stacking context where they compose correctly with all higher-z overlays, and `.game-shell`'s solid `background-color: var(--color-bg)` remains the visual fallback in case any browser culls the negative-z pseudos.
- **PLAYER_ID question safety fallback.** `v0.8.2.0` removed the `question_text` hint from the PLAYER_ID template, leaving the career path as the whole puzzle. That assumed `career_path` is always populated. Added an `@else` branch that renders the question's `question_text` if `career_path` is missing or empty (legacy questions, LLM generation failures, DB integrity issues), so the player always has SOMETHING to answer instead of a blank card with a name input below. The happy-path display is unchanged — the hint only appears when there's literally no career data.
- **Battle Royale `leaveRoom()` now always navigates, even on backend failure.** `v0.8.2.1` fixed the `team_logo` mode preservation when leaving a BR room, but `await this.store.leaveRoom()` could still throw (network error, stale session), and the uncaught throw meant `router.navigate` never ran — the user would be stuck on the BR play screen with cleared local state but no route change. Wrapped the await in `try/finally` so navigation fires unconditionally. The backend failure is still swallowed (intentional — the user clicked leave, respect it), but the user always lands back in the lobby.

## [0.8.2.1] - 2026-04-17

### Fixed
- **Battle Royale: leaving a `team_logo` room now returns you to `/battle-royale?mode=team_logo`, not the classic lobby.** Previously, `leaveRoom()` in `battle-royale-play.ts` and the 404 "room deleted" redirect in `battle-royale.store.ts` both hardcoded `router.navigate(['/battle-royale'])` with no query params, dropping `?mode=team_logo` and sending team-logo players to the wrong lobby. Both sites now read `store.roomView()?.mode` (already populated from the backend's `BRPublicView.mode`) and pass `{ queryParams: { mode: 'team_logo' } }` when appropriate. The "no roomId" guard redirect in `ngOnInit` stays unchanged — no mode context to preserve when the URL itself is malformed.

## [0.8.2.0] - 2026-04-17

### Changed
- **Board phase gets an Arena Scoreboard redesign on a floodlit-stadium backdrop.** The 2-Player score cards (`app-board`) were flat `--color-surface-low` boxes relying on a 3px turn strip and a tinted name to carry all player identity — calm but visually boring, and the score numeral (36px) lost hierarchy to the 50/50 and 2x chips. Redesigned following `ui-ux-pro-max`'s recommendation for competitive-gaming UIs: **Vibrant & Block-based + Comparative Analysis** patterns, duotone blocks, high contrast (7:1+), large display type. The active player's card now **floods with their color** via a 135° gradient wash, lifts 2px, runs a subtle 3.2s scoreboard-style sheen across the surface, and widens its left-edge identity stripe from 4px → 6px — so "whose turn is it" reads from across the room instead of relying on a tiny text tint. The score numeral is now **64px Alfa Slab One** (stadium-jumbotron slab-serif, already loaded for brand use) with tabular numerals, a 2px hard drop-shadow, and a color-matched glow when active. The `TURN` pill became a hard white block with a 1.8s bob; powerups are solid duotone chips; the armed `2x` chip pulses white-ringed **electric magenta** (`#ec4899`, scoped to this single state — unique to the 2x multiplier, deliberately not a reusable token) so it can't be confused with P1 blue, P2 orange, success green, or the battle-royale purple already in use; the `Use 2x` CTA is a chunky color button with a 3px hard-shadow base and `min-height: 44px` for Apple HIG / Material touch-target compliance; the streak/accuracy stat chip gained a green-glowing success dot. The "VS" divider is now a **hexagonal chrome coin** (CSS `clip-path`) instead of a muted gray label. `app-game` now renders the whole in-game screen on a freshly generated **floodlit stadium** background (`/game-bg.webp`, 42 KB, 1080×1920) sitting behind a radial vignette that guarantees UI contrast; a slow 24s `transform: scale(1→1.04)` breathe keeps the stadium feeling alive without distracting, disabled under `prefers-reduced-motion`. The BG image was generated via Vertex AI (`gemini-3-pro-image-preview`, service-account auth) by a new one-shot script `backend/scripts/vertex-generate-game-bg.js` that reuses the existing `gen-lang-client-0272230126` project — no new credentials, no new services. CSS budget untouched (board.css ~11 KB, well under the 14 KB per-component limit). Score card DOM is byte-for-byte identical. Two small behavior changes in the question flow: (1) the back-to-home button in `app-game` is now hidden during the `question` phase (in addition to `loading`/`finished`), so users can't accidentally bail out mid-question and lose committed state — the phase's own flow (answer or timeout) is the only exit; (2) the `PLAYER_ID` question template no longer renders the `question_text` hint (e.g. "Which player had this career?") above the career-path timeline — the career path is now the whole puzzle, clean and unguided, matching the "read the clubs, guess the player" spirit of the category.

## [0.8.1.2] - 2026-04-17

### Changed
- **LCP optimization: 2-Player card background preloads.** Added `priority` to the `<img ngSrc>` inside `.two-player-card` on the home page. Angular's `NgOptimizedImage` now emits a `<link rel="preload">` for `/2-player-mode.png`, so the image starts downloading in the HTML parse phase instead of waiting for Angular bootstrap and layout. On mid-range mobile, the 2-Player card's hero image was a plausible LCP candidate below the fold of taller screens but above the fold on most. Preloading it shaves typical LCP by 200–400ms on cold loads. No behavior change.

## [0.8.1.1] - 2026-04-17

### Fixed
- **Production build unblocked.** Raised Angular `anyComponentStyle` error budget from 20 kB to 25 kB in `frontend/angular.json`. `profile.css` (20.02 kB after organic growth over several PRs) had tipped 24 bytes past the old limit, breaking every Vercel deploy on `main` regardless of what the PR changed. No CSS was removed; this is a deliberate budget adjustment to match how the profile page has actually grown. Per-component budgets remain tight enough to catch runaway bloat (warning still fires at 14 kB).

## [0.8.1.0] - 2026-04-17

### Added
- **+262 football club logos across 5 new countries.** Logo Quiz and Team Duel now draw from a much richer pool: **Argentina** (+24), **Brazil** (+24), **France** (+35), **Italy** (+71), **Portugal** (+108). Every new logo ships with two difficulty variants: **easy** (team text removed via Gemini 3 Pro Image) and **hard** (text removed + flipped + desaturated). The hard variant is now correctly derived from the text-erased easy source instead of the original, so hard is genuinely harder than easy. Total production pool: **1,661 logos across 60 countries** (from 1,399). Users will see new clubs immediately in solo Logo Quiz, Logo Duel (`/duel?mode=logo`), and Team Logo Battle Royale (`/battle-royale?mode=team_logo`). 290 logos were AI-generated, manually reviewed via `review.html`, and 28 rejected for quality (3 cup/trophy logos — Coupe de France, Coppa Italia, Taça de Portugal — removed at pre-merge review because "what team is this?" has no valid answer for a competition trophy). Previously approved countries (England, Spain, Germany, Netherlands, Greece, Albania) also had their hard variants regenerated from text-erased sources to fix the same latent issue.

## [0.8.0.1] - 2026-04-17

### Added
- **Level-up flash trigger activated in `TopNavComponent.ngOnInit`.** The previously-scaffolded CSS animations (`top-nav__xp-progress--leveling` flash + level number pop) were dormant until a trigger effect was written. Added a signal `effect()` that watches `level()` for real in-session increments and toggles `levelingUp` for 600ms to fire the animation. First-load policy is **strict**: the effect skips the initial transition from the signal default (1) to the loaded profile value by waiting for `statsLoading()` to clear and then anchoring `lastSeenLevel` on the first real value, so the flash never fires on a page refresh, only when a user actually gains a level mid-session. Reuses `this.injector` for the effect registration and `prefers-reduced-motion` is already honored at the CSS layer.

## [0.8.0.0] - 2026-04-17

### Added
- **Top navigation XP progress bar.** Replaced the 4-chip mode-stats row (Solo ELO + Logo ELO + W/L% + Level) with a single full-flex XP progress pill that shows `Lv N  ████████░░  X XP to N+1` and links to the profile page. The XP bar is the clearest engagement signal the nav can carry: it changes every game and creates visible progress toward the next level, so every session ends with a visible Zeigarnik/goal-gradient pull back. Uses floodlight cyan (`#06b6d4 → #67e8f9`) as the fill gradient, matching stadium atmosphere and deliberately avoiding the purple/violet "AI slop" palette. On narrow mobile (`<420px`) the username and XP suffix hide so the bar stays readable.
- **Level-up flash + number pop animation** (class `top-nav__xp-progress--leveling`). When the `level()` signal increments during a session, the pill flashes cyan glow for ~600ms and the level number scales 1→1.28→1 for ~500ms. Both honor `prefers-reduced-motion`. Trigger effect is scaffolded in `top-nav.ts:ngOnInit` with a TODO for the first-load-vs-increment debounce policy (currently dormant until that 5-line effect is written).

### Changed
- **Username moved from center to the identity cluster next to the avatar.** Previously sat awkwardly before the mode chips, now reads as "avatar + name" — the standard persistent-chrome identity pattern. Brightened from 70% to 85% opacity now that it's the written name of the identity anchor. Truncates to 5rem max-width and hides on narrow mobile.
- **Avatar bumped from 36×36 to 40×40, border from 2.5px to 3px, tier glow strengthened** (`0 0 10px tierGlow 40` vs `0 0 8px tierGlow 33`). Tier identity now lives entirely in the avatar ring and glow — the old standalone tier progress bar was redundant with the new XP bar.
- **Top-nav spacing switched from arbitrary rem values to `--space-*` tokens.** Header padding, left cluster gap, center padding, right cluster gap, and XP pill padding all reference the defined scale now.

### Removed
- **Compact logo icon from the logged-in nav** (`top-nav__logo-icon--compact`). Redundant with the avatar as identity anchor, sub-44px touch target, and home navigation is already reachable via the bottom-nav pill. Logged-out state keeps its full wordmark — brand presence belongs there.
- **Tier progress bar below the header** (`top-nav__tier-bar` + `top-nav__tier-bar-fill` + `tn-pulse` keyframe). Two parallel progress bars (tier-by-ELO + XP-by-games) couldn't coexist without confusing users. XP won — it changes every game; tier identity stays communicated via the avatar border color.
- **Dead signals in `TopNavComponent`**: `elo`, `logoQuizElo`, `blitzBest`, `rank`, `sessionDelta`, `correctStreak`, `tierPct`, `tierLabel`, `eloDisplay`, `streakDisplay`. All were defined but had no template references after the redesign.

## [0.7.5.1] - 2026-04-17

### Changed
- **WORKFLOW.md** — added blank lines after section headings for consistent markdown rendering across viewers.
- **`backend/scripts/vertex-easy-flcc.js`** — `--country=` flag now accepts a comma-separated list (e.g. `--country=gr,tr,cy`) so one invocation can batch multiple countries. Single-country syntax still works.

## [0.7.5.0] - 2026-04-17

### Changed
- **ELO tier ladder renamed from metal names to football-native names.** The old League-of-Legends-style ladder (Iron → Bronze → Silver → Gold → Platinum → Diamond → Challenger) always felt borrowed. Replaced with a ladder that reads like a football career arc every fan recognises instantly: **Sunday League → Academy → Substitute → Pro → Starting XI → Ballon d'Or → GOAT**. ELO thresholds, K-factors, and progression logic are unchanged — only tier keys, labels, achievement display names, and achievement emoji (🎒 Academy, 🪑 Substitute, ⚽ Pro, 🎽 Starting XI, 🥇 Ballon d'Or, 🐐 GOAT) are updated. Internal tier keys changed too (`challenger` → `goat`, `diamond` → `ballon_dor`, `platinum` → `starting_xi`, `gold` → `pro`, `silver` → `substitute`, `bronze` → `academy`, `iron` → `sunday_league`) — keys are not persisted anywhere, so no data migration needed for user records. DB migration `20260613000000_football_tier_rename.sql` updates achievement `name`, `description`, and `icon` in place; achievement IDs (`elo_750`, `elo_1000`, …) are unchanged so `user_achievements` rows are untouched.
- **Tier color palette refreshed to match the football semantics.** The old palette was metal-themed (amber, cyan, purple). Three tiers now recolor to fit the new ladder: **Pro** `#f59e0b` amber → `#10b981` emerald (on-pitch green), **Starting XI** `#06b6d4` cyan → `#2563eb` royal blue (elite captaincy), **Ballon d'Or** `#a855f7` purple → `#eab308` gold (the iconic golden ball). Sunday League, Academy, Substitute, and GOAT colors are unchanged — they already fit. Result: the color progression reads gray → brown → slate → pitch green → royal blue → gold → electric glow, matching the career-arc narrative.
- **Leaderboard ELO legend overlay** updated with the new names, ranges, colors, and football-native icons (🐐 GOAT, 🥇 Ballon d'Or, 🎽 Starting XI, ⚽ Pro, 🪑 Substitute, 🎒 Academy, 🥾 Sunday League). Footer now reads "All players start at Substitute (1000 ELO)".

## [0.7.4.1] - 2026-04-17

### Added
- **Achievements x/y stat in profile hero.** Fourth slot in the hero stat row shows `earned / total` so users see their completion progress at a glance without scrolling to the Achievements section. Reuses the existing `achievementsEarned()` and `achievements()` computed signals — no new state.

### Fixed
- **Solo Ranked lobby (idle phase) now has a back button.** Previously wrapped in `<app-screen mode="bleed">` which only emits a back button in `padded` mode, so the screen had no nav affordance. Added `<app-lobby-header (back)="goHome()" />` inside the bleed container (same pattern duel and battle-royale lobbies use).
- **Lobby header back button now renders correctly across all lobbies.** Root cause: `<app-lobby-header>` had no `:host { display: block }`, so browsers defaulted the custom element to `display: inline`, collapsing its host box to zero height inside the parent flex column. The inner `.lobby-header` div still painted but could end up clipped by the absolute-positioned `.hero-bg`. Fix lifts duel, battle-royale, and solo in one change.

### Changed
- **"Buy Me a Coffee" top-nav link now renders amber by default.** Promoted the hover styling (amber bg/border, `#fbbf24` text) to the base rule so the link reads as branded on first paint — critical on mobile where hover essentially doesn't exist. Kept `:hover` as a subtle amplification for desktop users.

## [0.7.3.1] - 2026-04-17

### Fixed
- **"View full analytics" link no longer hidden behind ELO sparkline gate.** The Pro-only analytics entry point lived inside `@if (sparklineData())`, so users with fewer than 2 ELO-history entries couldn't see it even when their Pro status was active. Lifted the `@if (isOwnProfile() && pro.isPro())` block out of the sparkline section into its own standalone block between ELO Progression and Mode Stats. Added `.analytics-link--standalone` modifier for centered spacing when it renders on its own.

## [0.7.3.0] - 2026-04-17

### Changed
- **2-Player setup: "How it works" legend replaces the single-line footer.** The old `{{ lang.t().howToPlay }}` footer ("7 categories · Up to 3 difficulties · 2 lifelines each") was decorative but didn't actually teach the rules. Replaced with a proper `<aside>` legend above the player-name card, using a definition list (Turns, Points, 50-50, 2x multiplier, Win). Reads like a quick-reference card, sits in the player's eyeline before they enter names, and explains the 2x-must-be-armed-first nuance that players consistently missed.

### Removed
- `lang.howToPlay` translation key — now unused after the legend replaces the footer.

## [0.7.2.0] - 2026-04-17

### Added
- **Onboarding sampler (5-category tasting menu)** — first-run tutorial now pulls one EASY question per category (Logo Quiz, Higher or Lower, Geography, History, Player ID) directly from `question_pool`, so every new user gets a live taste of every mode instead of 5 random daily questions. Fixed order: visual hook → binary → warm-up → history → finisher.
- **Onboarding lobby screen** — welcome screen before the quiz with hero emoji, 5-category preview row, and `<app-primary-btn variant="accent" size="lg">` "Let's go" CTA. Questions are prefetched in the background during lobby, so the Start tap is zero-latency when the fetch completes in time.
- **Logo crest reveal on answer** — LOGO_QUIZ reveal now shows the original (un-obscured) crest on a white plate inside the flash overlay, sourced from `question.meta.original_image_url` (same pattern as live Logo Quiz mode).
- **Category label chip** — each onboarding question displays its mode name above the prompt (e.g. "🛡️ Logo Quiz", "📊 Higher or Lower") so users connect the sampler to real modes they'll see on the home screen.
- **New backend module** `backend/src/onboarding/` — `OnboardingController`, `OnboardingService`, `OnboardingQuestion` type, registered in `app.module.ts`. Exposes `GET /api/onboarding/questions` (no auth). Draws non-destructively from `question_pool` (plain SELECT, not `draw_questions` RPC) so onboarding doesn't deplete the pool.
- **Cross-question distractor fallback** — for categories where pool rows have empty `wrong_choices` (LOGO_QUIZ and PLAYER_ID use fuzzy text matching in real gameplay), distractors are borrowed from sibling rows' `correct_answer` values in the same category. Fixes the single-choice MC bug.
- **`onboarding_question_answered` analytics event** — fires per answer with `category` + `correct`, enabling per-category funnel analysis.

### Changed
- **Onboarding now fetches from `/api/onboarding/questions` instead of `/api/daily/questions`** — `DailyApiService` is no longer used for onboarding. Dropped the 5-item slice of generic daily questions in favor of category-typed MC.
- **"Tap to continue" hint visible on correct answers too** — previously only shown on wrong. Correct answers still auto-advance at 1.5s; the hint just makes the manual-advance affordance discoverable.

### Fixed
- **Onboarding no longer renders single-button MC questions** — some pool rows (LOGO_QUIZ, PLAYER_ID) had empty `wrong_choices`, which caused the UI to render only the correct answer as a choice. Donor-pool augmentation + 2-choice requirement for HIGHER_OR_LOWER eliminates this.

## [0.7.1.0] - 2026-04-17

### Added
- **`<app-screen>` primitive** — canonical screen shell with two modes: `bleed` (full-viewport lobby) and `padded` (max-width content with back-button header and `[screen-title]` / `[screen-action]` slots). Replaces duplicated `bg-background flex flex-col page-stagger` wrappers and ad-hoc back-button header rows.
- **`<app-primary-btn>` primitive** — canonical CTA with `accent` / `purple` / `ghost` variants and `md` / `lg` sizes. Handles loading and disabled state internally; emits `pressed` only when actionable. Replaces the `lobby-start-btn` + per-screen `-start-btn` family.

### Changed
- **Blitz mode migrated to shared primitives** — `blitz.html` idle state uses `<app-screen mode="bleed">` + `<app-primary-btn size="lg">`. Non-idle state uses `<app-screen mode="padded" showBack>` with the "⚡ Blitz" title in the canonical header slot.

### Fixed
- **Solo mode no longer references undefined components on main.** Since v0.7.0.0, `solo.html` used `<app-screen>` and `<app-primary-btn>` but neither the component files nor the `solo.ts` imports existed — production main failed to compile the Solo route. This PR adds the missing components and imports.

## [0.7.0.0] - 2026-04-17

### Changed
- **2-Player game visual redesign (all 6 phases)** — realigned every game phase to the Floodlit Arena design system (DESIGN.md, 2026-03-24). The entire game flow had drifted to a pre-redesign "premium glass" aesthetic using lime `rgba(204,255,0,*)` instead of the brand accent iOS blue `#007AFF`.
  - **Question**: CSS rewritten from 555 to 139 lines. Glass-on-everything replaced with tonal surfaces. 4 idle infinite animations removed (shimmer, player-glow, double-armed-glow, corner blobs). Skeuomorphic Higher/Lower buttons flattened. Question text upgraded to Inter title-lg (1.375rem/600).
  - **Setup**: matchday poster composition. Full-bleed stadium pitch background with atmospheric overlay. Bold STEPOVR. brand moment in Alfa Slab One italic. "STARTING LINEUP" eyebrow in Lexend. Decorative chrome removed (logo badge, wordmark duplicate, VS divider, ball emoji).
  - **Board**: tokenized end-to-end. Score numbers in Space Grotesk tabular-nums, turn badges in Lexend. End-game button bumped to 44px touch target.
  - **Result (per-question)**: Continue button aligned to iOS blue gradient. Score cards use blue/orange tokens.
  - **Finals**: stadium pitch background (game ends where it started). Trophy glows iOS blue. "Final Results" heading upscaled to Space Grotesk 2.5rem. Non-winner player cards demoted from glass to flat surface.
  - **Loading**: spinning football emoji replaced with branded pulsing StepOver mark.
- **Player identity unified** — P1 = `--color-accent` (iOS blue), P2 = `--color-warning` (orange) across all 6 phases. Previously used hardcoded `#3b82f6` / `#ef4444`.
- **Token system extended** — 10 new CSS custom properties: `--color-border-ghost`, `--color-accent-bg-subtle`, `--color-accent-border-soft/-med`, `--color-warning-bg-subtle/-border-soft/-med`, `--duration-pulse`, `--shadow-text-subtle`. Light-theme glass override via `:root:not(.dark)`.
- **Shared `.loading-tile`** — extracted to `styles/components/_loading.css`. Replaces emoji spinners in game loading, solo, and logo-quiz.
- **Emoji removed from copy** — "Kick Off! ⚽" → "Kick Off", "Play Again ⚽" → "Play Again", "🤝 It's a Draw!" → "It's a Draw".
- **Theme toggles removed** from game phases (board, setup, loading).

### Fixed
- **Question screen black band + overflow scroll** — question page had its own background color that conflicted with the game wrapper, creating a visible black band at top. Replaced `min-h-screen` with `flex-1` inside the now-flex game wrapper.
- **Setup card anchored to top** — `flex-1` couldn't resolve a concrete height. Fixed with explicit `min-height: calc(100dvh - 9.5rem)`.
- **A11y hardened across all game phases** — labels linked to inputs via `for`/`id`, visually-hidden `<h1>` headings on every phase for screen-reader orientation, `role="alert"` on error banners, `role="status"` on result cards, `aria-label` on board question circles ("Geography, 100 points, unanswered"), `aria-describedby` on disabled Kick Off with helper hint, `focus-visible` rings on all interactive elements, back button minimum 44px touch target. All animations respect `prefers-reduced-motion`.

## [0.6.2.1] - 2026-04-16

### Fixed
- **Notifications show real publish time** — frontend-synthesized News and Daily notifications no longer stamp `createdAt` at fetch time (which always displayed "Just now"). Backend now returns `round_created_at` (News) and `publishedAt` (Daily from `daily_questions.created_at`); the notifications service uses those, falling back to `expires_at/resetsAt − 24h` if null. Touches `backend/src/news/news.service.ts`, `backend/src/daily/daily.service.ts`, `frontend/src/app/core/{news,daily,notifications}-api.service.ts`.

## [0.6.2.0] - 2026-04-16

### Added
- **`wipe-account.mjs`** — dev utility to fully reset a user account (profile stats, ELO, XP, level, match_history, user_achievements, user_mode_stats, xp_history, elo_history, duel_games). Reads target credentials from `WIPE_EMAIL` / `WIPE_PASSWORD` env vars (never hardcoded). Verifies the wipe with a post-reset profile read.
- **`backend/scripts/delete-medium-erasures.ts`** — one-shot storage cleanup: scans `logo-quiz/erasures/{slug}/` folders and removes the now-unreferenced `medium.webp` files. Supports `--dry-run`. (Already executed — removed 654 files.)
- **E2E sim match-history writes** — `e2e-game-sim.mjs` now POSTs to `/api/match-history` after duel and battle royale games so simulated runs populate the match history view (mirrors the existing 2P save).

### Changed
- **Chart.js registration** (`frontend/src/main.ts`) — register `CategoryScale`, `LinearScale`, `PointElement`, `LineElement`, `BarElement`, `BarController`, `LineController`, `Title`, `Tooltip`, `Legend` at bootstrap. Fixes "is not a registered scale/controller" errors on the analytics dashboard.
- **2P sim wrong answers** (`e2e-game-sim.mjs`) — replaced placeholder `definitely_wrong_{random}` strings with a pool of realistic filler answers (`unknown`, `nobody`, `idk`, etc.) so match history shows readable `given_answer` values.
- **2P sim peek fallback** — surface 401/unreachable peek failures with an explicit warning and fall through to a pool of common football answers instead of silently using `'random guess'`.

### Security
- **`e2e-game-sim.mjs`** — `ADMIN_KEY` no longer defaults to a hardcoded admin token; when `ADMIN_API_KEY` is unset, the admin-peek path fails closed and the sim falls through to fuzzy answers.

### Removed
- **52 broken entries in `footy-logos.json`** — legacy rows that had a `real_image_url` but no EASY/HARD erasure URLs (unusable as quiz questions). Dropped one fully-empty competition (`uefa-champions-league`).
- **654 orphaned `medium.webp` files** from Supabase storage (unreferenced since the MEDIUM tier was removed in 0.6.1.0).

## [0.6.1.0] - 2026-04-16

### Added
- **Logo Quiz — 283 new teams** from football-logos.cc across England, Spain, Netherlands, Germany, Greece, Albania (7 synthetic per-country competitions). Seeded into `question_pool` as 566 new rows (EASY + HARD).
- **`vertex-easy-flcc.js`** — Vertex AI (gemini-3-pro-image-preview) batch script for text-removal erasures from crawled PNGs. Includes proactive pacing (`--delay`), hard request timeout (90s via `AbortController`-style `req.destroy`), bounded rate-limit retries (10x cap), and league/competition filter (skips league logos that Gemini garbles).
- **`generate-hard-flip-desaturate.ts`** — generates HARD variants (horizontal flip + desaturate) from the Gemini EASY outputs so both difficulty tiers share the same text-removed base.
- **`ingest-flcc-approved.ts`** — reads manual approve/reject decisions, uploads originals + erasures to Supabase storage, appends to `footy-logos.json`, seeds `question_pool`. Dry-run supported.
- **`review.html`** — local review UI for the flcc batch. Shows original / EASY / HARD side-by-side with keyboard-free approve/reject, localStorage persistence, and export to `decisions.json`.

### Changed
- **`footy-logos.json` schema** — dropped `medium_image_url` field; only EASY and HARD variants are supported going forward.

## [0.6.0.0] - 2026-04-16

### Added
- **Structured taxonomy on every question** — 15 new columns on `question_pool` (`subject_type/id/name`, `competition_id`, `question_style`, `answer_type`, `mode_compatibility`, `concept_id`, `popularity_score`, `time_sensitive`, `valid_until`, `tags`, `solve_rate`, `avg_time_ms`, `nationality`). Every future mode (themed quizzes, concept mastery, adaptive difficulty, geo-filtering) can now be built without more schema migrations.
- **`QuestionClassifierService`** — new service that tags every generated question against a reviewed canonical entity list (1,122 players / teams / leagues / trophies / managers / stadiums / countries). Strict validation prevents slug drift.
- **`competition_metadata` table** — single source of truth for league / trophy / award facts (tier, type, country, founded/defunct years). 84 competitions seeded + reviewed.
- **Auto-classification on new questions** — `PoolSeedService` now runs the classifier before every INSERT, so new pool entries land fully tagged.
- **Logo-quiz cache invalidation** — `seed-logo-questions.ts` now busts the team-names Redis cache after seeding, so newly-seeded logos appear in the select immediately instead of after a 1-hour TTL.

### Changed
- `league_id` renamed to `competition_id` — column now accepts either a league slug (`premier-league`) or a trophy/tournament slug (`uefa-champions-league`) so questions scoped to cups / continental comps are queryable.
- `era` converted to a `GENERATED ALWAYS AS STORED` column derived from `event_year`. Self-maintaining, no write path, analytics unchanged.
- `league_tier` and `competition_type` now auto-fill from `competition_metadata` via the `sync_question_pool_competition_meta` trigger. Generator-provided overrides still win via COALESCE.
- Trigger emits `RAISE WARNING` when a question is written with an unknown `competition_id`, so silent drift is visible in Supabase logs.

### Backfill
- 2,128 / 2,128 non-logo questions backfilled. 87.8% `subject_id` coverage, 71.6% `competition_id`, 99.7% `concept_id`, 98.5% `popularity_score`, 83% `nationality` on applicable subjects.

## [0.5.2.0] - 2026-04-15

### Added
- **Mode picker on `/analytics`** — switch between Solo Ranked, Logo Quiz, and Hardcore views. Each mode shows its own Current ELO, Peak ELO, trajectory, and breakdowns instead of blending all three into one misleading chart.

### Fixed
- Analytics no longer mixes ELO events from different ranked modes. Previously, users who played Logo Quiz and Solo would see a trajectory jumping between two different ELO systems on the same line; now each mode is isolated.

## [0.5.1.0] - 2026-04-15

### Added
- **Category strengths & weaknesses** now appear on your Pro Analytics dashboard — see which question types you dominate and which need work, with sample sizes so you know when to trust the numbers.
- **Accuracy by era** — see how you stack up on 90s, 2000s, 2010s, and 2020s football trivia.
- **Accuracy by league tier** — separate views for Top-5 EU leagues, other European top flights, and the rest.

### Changed
- Removed the "Coming soon" placeholder card on `/analytics` now that all three breakdowns are live.
- Solo and Logo Quiz rounds now record which question was rated, so future analytics can join rich question metadata.

## [0.5.0.0] - 2026-04-15

### Added
- **Personal Performance Analytics (Pro)** — a new `/analytics` page showing your ranked journey. See how many questions you've answered, your accuracy %, current and peak ELO, days active, an ELO trajectory line chart, and accuracy broken down by difficulty tier.
- **"View full analytics" link** on your profile (Pro only) routes straight to the dashboard.
- **"Personal Performance Analytics"** bullet added to the Pro upgrade modal feature list.
- **Question metadata tagging pipeline** — newly LLM-generated questions now carry structured tags (league tier, era, competition type, event year, nationality) stored on `question_pool`. These power richer breakdowns coming soon.

### Changed
- Free users visiting `/analytics` see a blurred teaser with an "Unlock with Pro" CTA that opens the existing subscription sheet.
- Analytics dashboard gracefully handles zero-games state with clear empty messages per widget.

### Security
- `/api/analytics/me` now requires an explicit Pro subscription check (was previously relying on a permissive shared guard).

## [0.4.0.0] - 2026-04-13

### Added
- **Pro subscribers now see their last 100 matches** in match history, instead of the last 10 that free users see.
- **Pro subscribers can review every question after any match.** Tap any match and see the question text, the correct answer, and each player's actual answer, across Duel, Battle Royale, and 2-Player modes.
- **2-Player match cells are now tappable**, opening a detail popover (Pro) or prompting to upgrade (free).
- Free users tapping a locked question section see a clear "Unlock question review with Pro" upgrade prompt that opens the existing subscription sheet.

### Changed
- Battle Royale matches now persist each player's answers per question, so post-match review shows what you answered and whether it was correct.
- Duel matches now persist each player's typed answer, so both players can see what the other actually entered.
- Match history endpoint now authenticates the requester; viewing another user's profile returns the standard (non-Pro) match list depth regardless of the viewer's subscription.

### Fixed
- Previously, stripped question payloads could leak to free clients through the nested `detail_snapshot` field. Questions are now stripped server-side at every level before the response is sent.

## [0.3.3.0] - 2026-04-13

### Changed
- **Share buttons now open the native iOS/Android share sheet** instead of the browser's Web Share fallback, so duel, online 1v1, and Battle Royale invites flow through the OS share UI users expect.
- **Invite messages now include a tap-to-open deep link plus a copy-paste code**, so recipients can either tap the link (if installed) or paste the code into the app.

### Fixed
- Sharing no longer dumps the invite text into the clipboard when the user cancels the share sheet.
- Recipients no longer see the invite link appear twice in WhatsApp/iMessage previews.

### Added
- `stepovr://` URL scheme registered on iOS and Android. Tapping `stepovr://duel/CODE`, `stepovr://game/CODE`, `stepovr://br/CODE`, or `stepovr://invite` opens the app and routes to the matching screen.

## [0.3.2.0] - 2026-04-13

### Changed
- **Consistent back button across all screens** — lobbies (Online 1v1, Duel, Battle Royale), Notifications, Terms, Privacy, and Match Details now share a single header component with identical styling, touch-target size, and icon rendering.
- **Duel lobby now has a back button** — previously the only lobby without one.

### Fixed
- Online 1v1 lobby back arrow now renders correctly (previously the arrow icon was invisible due to a font-subset mismatch).
- Bottom navigation now auto-hides during active gameplay across Solo Ranked, Blitz, Mayhem, and Daily — preventing accidental taps that could abort a timed question. Previously only Logo Quiz had this behavior.

## [0.3.1.0] - 2026-04-12

### Changed
- **Online 1v1 lobby redesign** — rebuilt to match the premium lobby pattern used across the app. New hero image, atmospheric spotlight lighting, glass-surface active-game cards, and a bottom sheet for Create / Random Opponent / Join-by-Code actions.
- Restored back button in the top nav
- Active-game cards now show turn status with clearer color-coded badges (Your Turn / Their Turn / Waiting / Queued)

### Added
- Empty state on the online lobby when you have no active games
- Dedicated `/online-mode.png` hero asset (decoupled from the duel image)

### Fixed
- Long opponent usernames now truncate with ellipsis instead of breaking the card layout
- Bottom sheet is now keyboard-accessible: Escape dismisses, focus is trapped inside while open, and focus returns to the trigger on close
- All contrast ratios now meet or exceed WCAG AA (most AAA)
- Reverted an over-broad `.gitignore` rule (`docs/*`) that would have excluded project documentation

## [0.3.0.0] - 2026-04-12

### Added
- **XP & Leveling system** — earn XP on every correct and wrong answer, streak bonuses up to +30 for 15+ consecutive correct, +50 on duel wins, +75 on Battle Royale wins, +20 on Solo session completion, +15 on Blitz round completion, and +25 for your daily streak. Level up with an animated celebration overlay.
- Level badge in the top-nav next to Solo/Logo/W-L chips
- XP progress bar on the profile page showing progress to next level and total XP earned
- Floating "+XP" gain feedback in Solo mode (with separate styling for streak bonuses)
- `profiles.xp` and `profiles.level` columns, plus new `xp_history` audit table
- Server-side `award_xp` RPC with atomic row-lock, search_path hardening, and service-role-only execute

### Changed
- `updateDailyStreak` now centrally awards the daily-streak XP once per day across all game modes (not just Solo)
- Solo and Mayhem sessions track a dedicated `consecutiveCorrect` counter for accurate streak bonuses (resets on wrong/timeout)

## [0.2.0.0] - 2026-04-09

### Added
- **Online 2-Player Board Game** — play the full 7x5 board game remotely with a friend via invite code, with live spectating of your opponent's turn including wrong attempts and Top 5 slot fills in real-time
- Backend OnlineGameService with full game lifecycle: create, join, ready-up, select question, answer, Top 5 guessing, 50-50 lifeline, and turn timeout cron
- REST API at /api/online-games with 12 endpoints (all auth-guarded)
- Supabase Realtime subscriptions for live opponent state sync
- Spectating view: see opponent's question, wrong answer attempts, and Top 5 progress as they play
- CAS-guarded game mutations to prevent race conditions (join, answer, ready-up, continue)
- Turn timeout cron (2-minute turns, 5-minute check interval with Redis lock)
- ELO ranking legend overlay on leaderboard page, auto-shown on first visit
- Force-update banner system with soft and hard update modes
- Wrong-shake animation on incorrect answers across all game modes

### Changed
- LLM model names moved from hardcoded constants to environment-configurable properties
- Logo quiz header and news mode UX improvements

### Fixed
- Replaced test AdMob App ID with production credentials to fix crash on launch
- Top 5 meta data stripped from spectating player's view to prevent answer leaking
- Race condition in continueToBoard where both players clearing result simultaneously could cause one to miss it

## [0.1.1.0] - 2026-04-08

### Added
- Tablet layout support up to 1200px with 3-tier responsive system
- Global `:focus-visible` and `prefers-reduced-motion` baselines for all interactive elements
- 39 tag color tokens extracted to design token system

### Changed
- Home page mode cards: 2-col grid (tablet), 3-col grid (large tablet)
- Game question options: 2-col grid on tablet
- Battle hero title: per-character wave → staggered entrance + ambient glow
- Background drift: GPU-friendly transform (was animating layout properties)
- Tag color variants use shared tokens (was 70+ hard-coded hex values)
- Fluid typography via clamp() on hero and 2-player titles
- Default tag text contrast bumped to ~5:1 ratio

### Fixed
- Mode card overlays and duel active game row now keyboard-accessible (div → button)
- Duplicate aria-label removed from battle-hero title
- Section header and mode-card-container now have visible focus indicators

## [0.1.0.0] - 2026-04-08

### Changed
- Redesigned ELO system with 7 tiers (Iron/Bronze/Silver/Gold/Platinum/Diamond/Challenger) using expanding tier gaps for gradual progression
- Added EXPERT difficulty level for 1800+ ELO players with 20s time limit and elite-level questions
- Updated K-factor bands to 40/32/24/16 aligned with 4 difficulty zones (EASY/MEDIUM/HARD/EXPERT)
- Raised ELO floor from 100 to 500 so players can't fall into an unrecoverable hole
- Shortened provisional multiplier period (1.5x for first 30 questions, 1.25x for 30-99, settled at 100+)
- Aligned bot skill thresholds to the 7-tier system (0.20-0.70 range)
- Aligned minority scale and difficulty ranges to new ELO breakpoints
- Updated frontend tier display with Platinum tier and new thresholds (500/750/1000/1300/1650/2000/2400)

### Added
- New ELO tier achievements (Bronze 750, Silver 1000, Gold 1300, Platinum 1650, Challenger 2400)
- EXPERT difficulty scoring threshold in question difficulty scorer (raw score 0.62+)
- ELO service unit tests (12 tests covering difficulty mapping, K-factors, provisional multiplier, floor)
- ELO floor migration bumping all existing players below 500 to the new floor
