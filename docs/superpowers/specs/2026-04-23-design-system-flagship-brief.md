# Flagship Redesign Brief — `/blitz` as the Design-System Anchor

**Date:** 2026-04-23
**Purpose:** Forge the reusable `so-*` primitive set against one real consumer before fanning out to all features.
**Handoff target:** `claude-design` agent (or any design-focused redesign pass).
**Branch:** Create a feature branch before starting (e.g. `redesign/blitz-flagship`).

---

## Why `/blitz`

`/blitz` is the ideal flagship because it exercises the highest-leverage primitives in one self-contained screen with no router-outlet children and no matchmaking flow. Forging the primitive set here means every other game mode (`/solo`, `/daily`, `/logo-quiz`, `/battle-royale`, `/duel`, `/mayhem`, `/game`) gets a 50–70% head start.

Primitives this one screen will define:
- `so-timer-display` — reused by 6 modes
- `so-question-card` — reused by 4+ modes
- `so-choice-button` — reused by every MCQ mode
- `so-score-header` — reused by 4+ modes
- `so-result-flash` — reused by 4+ modes
- `so-modal-dialog` — reused by 36 current inline instances
- `so-hero-section` — reused by every mode's idle/lobby screen
- `so-finish-summary` (or equivalent) — reused by every end-of-session screen

---

## Scope

**In scope — agent may modify:**
- `frontend/src/app/features/blitz/blitz.html`
- `frontend/src/app/features/blitz/blitz.css`
- `frontend/src/app/features/blitz/blitz.ts` — **imports only** (swap old shared components for new `so-*`), **nothing else**
- `frontend/src/app/shared/ui/so-*/` — create new primitives as needed
- `frontend/src/app/shared/ui/index.ts` — export new primitives

**Out of scope — do not touch:**
- Any `.ts` file outside of `blitz.ts` imports
- Any signal declaration, method body, `constructor`, `ngOnDestroy`, `effect()`, or inject()
- Any other feature route
- Any backend code
- `app.config.ts`, route definitions, or module configuration

---

## Guardrails (strict)

The design agent **must**:

1. **Preserve every signal/computed/method name referenced in the template.** If the template currently says `phase()`, `timeLeft()`, `score()`, `currentQuestion()`, `choiceClass(choice)`, `selectChoice(choice)`, `dismissFlash()`, `reportQuestion()`, etc. — those exact names must still work after the redesign. The template may restructure, but the bindings must match.

2. **Preserve the exact public `.ts` surface.** The agent may only:
   - Add/remove entries in the component `imports: []` array
   - Add/remove import statements at the top of `blitz.ts`
   Nothing else in `blitz.ts` may change.

3. **Preserve behavior.** All three phases (`idle` / `playing` / `finished`), the 1-second auto-advance after `showFlash`, the timer's red-tint at ≤10s, and the problem-reported modal must all still work.

4. **Preserve accessibility.** `<app-answer-flash>` currently handles ARIA announcements and reduced-motion. Any replacement `so-result-flash` must keep the `[announcement]` input contract (string read by screen readers) and honor `prefers-reduced-motion`.

5. **Tokens only.** All colors/spacing/radii/shadows must come from the existing CSS custom properties (`bg-card`, `text-accent`, `border-border`, `bg-loss`, `bg-win`, `text-foreground`, etc.). No hex literals, no arbitrary pixel values outside the token scale.

---

## Primitives to Forge (with required APIs)

The agent must create these as real Angular standalone components under `shared/ui/so-*/`. Each needs a `.ts`, `.html`, `.css`, and must be exported from `shared/ui/index.ts`.

### `so-timer-display`
```ts
@Input() secondsLeft: number          // current remaining seconds
@Input() totalSeconds: number         // 60 for blitz
@Input() urgentThreshold: number = 10 // seconds below which it turns red
@Input() variant: 'bar' | 'pill' = 'bar'
```
Must render: big `tabular-nums` number + progress bar. Color ramp from accent → loss when `secondsLeft <= urgentThreshold`.

### `so-score-header`
```ts
@Input() score: number
@Input() total: number                // total answered
@Input() scoreLabel?: string
@Input() totalLabel?: string          // e.g. "answered"
```
Right-aligned block: big score number, small total-answered caption.

### `so-question-card`
```ts
@Input() text: string
@Input() imageUrl?: string            // for logo-quiz reuse later
@Input() minHeight: string = '110px'
```
Card with generous padding, min-height, renders either text or image+text.

### `so-choice-button`
```ts
@Input() label: string
@Input() state: 'idle' | 'selected' | 'correct' | 'wrong-selected' | 'correct-reveal' | 'dim' = 'idle'
@Input() disabled: boolean = false
@Output() pressed = new EventEmitter<void>()
```
Must replace the current `choiceClass(choice)` method's visual branching. Full-width, pressable animation on active, shake on `wrong-selected`.

**Important:** The current `.ts` has `choiceClass()` returning a string of Tailwind classes. After redesign, `choiceClass()` must return a `so-choice-button` **state value**, not a className. Agent must update `choiceClass()` return logic to emit `'correct' | 'wrong-selected' | 'correct-reveal' | 'dim' | 'idle'`. **This is the one method body change permitted** — but signature and call sites stay identical.

### `so-result-flash`
Wraps/replaces the existing `<app-answer-flash>`. Must preserve:
```ts
@Input() correct: boolean
@Input() announcement: string         // a11y string
@Input() dismissible: boolean = true
@Output() dismiss = new EventEmitter<void>()
```
Plus slot for custom content (big emoji, text).

### `so-modal-dialog`
```ts
@Input() open: boolean
@Input() dismissOnBackdrop: boolean = true
@Output() dismissed = new EventEmitter<void>()
```
Content-projected body. Replaces the current "problem reported" inline modal and prepares for the 35+ other inline modals across features.

### `so-hero-section`
```ts
@Input() bgImage: string              // path to ngSrc-optimized image
@Input() title: string
@Input() subtitle?: string
```
Content-projected body for buttons/cards. Handles the `hero-bg__img` + `hero-bg__overlay` pattern.

### `so-finish-summary`
```ts
@Input() headline: string             // e.g. "Time's up!"
@Input() score: number
@Input() accuracyPercent: number
@Input() totalAnswered: number
```
Content-projected footer for CTA buttons. Replaces the current `finished` phase layout.

---

## Existing Shared Components to Reconcile

These predate the `so-*` system and are used by `blitz.html`:

| Old | Action |
|---|---|
| `app-screen` (shell with `mode="bleed"` / `mode="padded"`) | **Keep as-is** — it's a layout shell, not a visual primitive. Decision: do not replace in this pass. |
| `app-primary-btn` | **Replace with `so-button`** — `so-button` already exists with matching `variant`, `size`, `fullWidth`, `loading`, `disabled`, `(pressed)` API. One-to-one swap. |
| `app-answer-flash` | **Wrap inside new `so-result-flash`** — keep the a11y + motion logic, give it the redesigned visual shell. |

---

## Definition of Done

- [ ] All new `so-*` primitives created, exported from `shared/ui/index.ts`
- [ ] `blitz.html` uses only `so-*` primitives + `app-screen` for layout
- [ ] `blitz.ts` `imports: []` array updated; nothing else in the class changed except `choiceClass()` return value (see note above)
- [ ] `blitz.css` no longer contains styling that duplicates what's in the new primitives
- [ ] `npm run build` passes from `frontend/`
- [ ] Manual smoke test: idle → playing → correct answer → wrong answer → time expires → finished → play again
- [ ] Screen reader announcement still fires on each flash (use VoiceOver on iOS simulator or macOS)
- [ ] Reduced-motion respected
- [ ] Report-problem flow still works end-to-end
- [ ] Ad service hooks still fire (`adService.resetQuestionCounter()`, `onAnswerSubmitted()`, `onGameEnd()`, `markFirstSessionComplete()`) — don't touch these calls

---

## After Merge

Once this lands:
1. Freeze the `so-*` APIs created here (don't redesign them in subsequent routes)
2. Write a one-page `shared/ui/README.md` listing each primitive, its API, and a screenshot
3. **Then** fan out to remaining routes in parallel — each agent gets the frozen API doc and redesigns one route

---

## Rollback

If the redesign breaks behavior:
1. `git checkout main -- frontend/src/app/features/blitz/`
2. Leave new `shared/ui/so-*/` primitives in place (they're additive) until root cause is found
3. Re-attempt with a tighter brief

---

## Agent Handoff Prompt (copy-paste)

> Redesign the `/blitz` route of this Angular 20 app using the `so-*` design system pattern in `frontend/src/app/shared/ui/`. Follow `docs/superpowers/specs/2026-04-23-design-system-flagship-brief.md` exactly. Create the primitives it specifies with the exact APIs listed. Touch only the files it marks as in-scope. Do not modify any `.ts` file outside of `blitz.ts` imports, and within `blitz.ts` change only the `imports: []` array and the return value of `choiceClass()`. Run `npm run build` from `frontend/` before declaring done. Create a feature branch first.
