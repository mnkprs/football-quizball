# STEPOVR Development Workflow

## Full Workflow (gstack skills)

### Phase 0 — Ideation
- `/office-hours` — Brainstorm the idea, stress-test if it's worth building. YC-style forcing questions for startups, or design-thinking mode for side projects.

### Phase 1 — Design
- `/design-consultation` — Creates a full design system (typography, colors, spacing, motion) and writes `DESIGN.md` as the project's design source of truth. Best for new projects or major visual overhauls.

### Phase 2 — Planning
- Enter plan mode and create the implementation plan.
- `/autoplan` — Runs all three reviews automatically:
  - **CEO Review** — Scope, strategy, ambition
  - **Engineering Review** — Architecture, edge cases, tests
  - **Design Review** — UX gaps, visual consistency

Individual reviews can also be run separately:
- `/plan-ceo-review` — "Think bigger" or "Is this scoped right?"
- `/plan-eng-review` — Architecture deep-dive
- `/plan-design-review` — UX/UI critique

### Phase 3 — Implementation
- Execute the plan (direct implementation or `/do` for phased execution).

### Phase 4 — Quality

**Code Review:**
- `/review` — Code review the diff before landing.
- `/codex` — Independent second opinion (adversarial reviewer).

**QA Testing:**
- `/qa` — Full loop: tests the live site, finds bugs, fixes them in source code, commits each fix atomically, re-verifies. Produces a health score and ship-readiness summary. Three tiers: Quick (critical/high), Standard (+ medium), Exhaustive (+ cosmetic).
- `/qa-only` — Report only: same testing as `/qa` but produces a structured bug report without touching any code. Use when you want a bug list without auto-fixes.
- `/design-review` — Visual QA: finds spacing issues, hierarchy problems, inconsistencies, and AI slop patterns, then fixes them with before/after screenshots.
- `/browse` — Manual QA: walk through a specific flow step by step with screenshots and assertions. Use when you want to test a specific user journey interactively.

**Security:**
- `/cso` — Security audit (OWASP Top 10, STRIDE threat modeling, secrets archaeology, dependency supply chain).

### Phase 5 — Ship
- `/ship` — Merge base branch, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR.
- `/land-and-deploy` — Merge the PR, wait for CI, verify production health via canary checks.
- `/canary` — Post-deploy monitoring for errors, performance regressions, and page failures.

### Phase 6 — Post-Ship
- `/document-release` — Sync all project docs to match what shipped.
- `/retro` — Weekly engineering retrospective.

---

## Updated Workflow with Google Stitch

Stitch integrates between ideation and planning as the visual design tool. Stitch screens become the visual spec that drives implementation.

### Phase 0 — Ideation
- `/office-hours` — Validate the idea.

### Phase 0.5 — Visual Design (Stitch)
1. **Create project** — `create_project` to set up a Stitch project for the feature.
2. **Set up design system** — `create_design_system` to configure colors, fonts, roundness, dark/light mode (can feed from `DESIGN.md`).
3. **Generate screens** — `generate_screen_from_text` to describe each screen and get UI mockups.
4. **Explore variants** — `generate_variants` to try alternative layouts, color schemes, or typography.
5. **Iterate** — `edit_screens` to refine specific screens with prompts.
6. **Apply consistency** — `apply_design_system` to ensure all screens match design tokens.

Review the screens in Stitch, pick what you like, then move forward.

### Phase 1 — Design System
- `/design-consultation` — Create or update `DESIGN.md` based on what was picked in Stitch (optional if design system is already established).

### Phase 2 — Planning
- Enter plan mode and create the implementation plan, referencing Stitch screens as the design spec.
- `/autoplan` — Full review pipeline (CEO + Engineering + Design), including checking against the Stitch mockups.

### Phase 3 — Implementation
- Execute the plan, matching the approved Stitch mockups.

### Phase 4 — Quality

**Code Review:**
- `/review` — Code review the diff.
- `/codex` — Independent second opinion.

**QA Testing:**
- `/qa` — Full loop: tests the live site, finds bugs, auto-fixes, re-verifies. Three tiers: Quick, Standard, Exhaustive.
- `/qa-only` — Report only: structured bug report without touching code.
- `/design-review` — Visual QA comparing the live site against Stitch mockups, auto-fixes spacing/hierarchy issues.
- `/browse` — Manual QA: walk through a specific flow interactively with screenshots.

**Security:**
- `/cso` — Security audit.

### Phase 5 — Ship
- `/ship` — Create the PR.
- `/land-and-deploy` — Merge, deploy, verify.
- `/canary` — Post-deploy monitoring.

### Phase 6 — Post-Ship
- `/document-release` — Sync docs.
- `/retro` — Retrospective.
