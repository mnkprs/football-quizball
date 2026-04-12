# Multi-Agent Feature Development Pipeline

**Date:** 2026-04-01
**Status:** Design
**Trigger:** On-demand via `/pipeline "<feature description>"`

## Overview

A skill-chaining orchestrator that takes a one-liner feature description and drives it through the full development workflow — ideation through shipping — using existing gstack skills. Each phase runs in an isolated git worktree agent. The pipeline pauses at every phase boundary for user approval before advancing.

## Pipeline State Machine

```
IDLE → IDEATION → DESIGN → PLANNING → IMPLEMENTATION → QUALITY → SHIP → POST-SHIP → DONE
```

### Phase States

Each phase progresses through: `pending` → `running` → `awaiting_approval` → `approved`

A phase can also enter `failed` if retries are exhausted (phases 3-4 only), at which point the pipeline escalates to the user.

### Trigger

```
/pipeline "Add hardcore mode to logo quiz"
```

The orchestrator:
1. Creates a `feature/<slug>` branch from `main`
2. Initializes `pipeline-context.md` at repo root
3. Runs Phase 0 in a worktree agent
4. Pauses for approval

Each subsequent approval advances to the next phase.

## Phase-to-Skill Mapping

| Phase | Name | Skill | Agent Input | Pass Condition | Output |
|-------|------|-------|-------------|----------------|--------|
| 0 | Ideation | `/office-hours` | User's one-liner | Produces feature brief | Feature brief text |
| 1 | Design | `/design-consultation` | Feature brief | Produces/updates DESIGN.md | Design tokens/decisions |
| 2 | Planning | `/autoplan` | Feature brief + design decisions | Plan passes CEO/eng/design reviews | Plan in `tasks/todo.md` |
| 3 | Implementation | Execute plan | Plan + design spec | All todo items completed, build passes | Code on feature branch |
| 4 | Quality | `/qa` then `/review` | Live site + diff | QA health acceptable, no CRITICAL review findings | QA report, review findings |
| 5 | Ship | `/ship` | Feature branch | PR created | PR URL |
| 6 | Post-Ship | `/document-release` | Merged PR | Docs updated | Updated docs |

### Phase Notes

- **Phase 4** runs `/qa` first (may auto-fix bugs), then `/review` on the final diff. Both are sequential within the phase.
- **Phase 6** only runs after the user manually merges the PR from Phase 5.
- Each phase agent receives accumulated context from prior phases via `pipeline-context.md`.

## Worktree & Branch Strategy

### Branch Lifecycle

1. Pipeline start → `git checkout -b feature/<slug>` from `main`
2. Each phase agent gets a fresh worktree on the feature branch
3. Agent commits changes to the feature branch
4. Worktree cleaned up after phase completes
5. Phase 5 pushes the branch and creates the PR

### Phase Categorization

- **Phases 0-2** (Ideation, Design, Planning): Produce docs/specs, committed to feature branch
- **Phase 3** (Implementation): Produces code, committed to feature branch
- **Phase 4** (Quality): May auto-fix bugs, commits fixes to feature branch
- **Phase 5** (Ship): Pushes branch, creates PR
- **Phase 6** (Post-Ship): Runs on `main` after merge

### Context Passing

Agents start fresh — no shared conversation history. Context flows via `pipeline-context.md`:

```markdown
# Pipeline Context
## Feature
<original one-liner>

## Phase 0 — Ideation
<feature brief summary>

## Phase 1 — Design
<design decisions summary>

## Phase 2 — Planning
<plan reference, key architecture decisions>

## Phase 3 — Implementation
<what was built, files changed>

## Phase 4 — Quality
<QA findings, review findings, fixes applied>
```

This file is gitignored — ephemeral orchestration state, not a shipped artifact.

## Retry & Escalation

### Failure Signals

| Phase | Failure Signal |
|-------|---------------|
| 0 - Ideation | N/A — always produces output |
| 1 - Design | N/A — always produces output |
| 2 - Planning | Autoplan reviews flag CRITICAL issues |
| 3 - Implementation | Build fails (`ng build` or `npm run build`) |
| 4 - Quality (QA) | `/qa` reports "not ship-ready" after fixes |
| 4 - Quality (Review) | CRITICAL findings remain after fixes |
| 5 - Ship | Push or PR creation fails |
| 6 - Post-Ship | N/A — best effort |

### Retry Loop (Phases 3-4 Only)

```
attempt = 0
while attempt < 3:
    run phase agent in worktree
    if pass_condition met:
        transition to awaiting_approval
        break
    attempt++
    feed failure output as context to next attempt

if attempt == 3:
    transition to failed
    present summary of all 3 attempts to user
```

### Retry Rules

- Phases 0-2: Never auto-retry. Always produce output. User gates quality via approval.
- Phases 3-4: Auto-retry up to 3 times. Each retry receives previous attempt's error output.
- Phase 5: Mechanical retries (push failures). No creative fix needed.
- After 3 failures: User gets a summary of what was tried, what failed, and what the agent thinks is blocking.

## Orchestrator Implementation

### Skill Definition

**File:** `skills/pipeline/pipeline.md`

The orchestrator is a Claude Code skill invoked via `/pipeline "<description>"`.

### Orchestrator Responsibilities

1. Parse the one-liner from skill args
2. Slugify the feature name, create `feature/<slug>` branch from `main`
3. Initialize `pipeline-context.md` with the feature description
4. For each phase:
   a. Spawn a worktree agent with phase-specific prompt
   b. Agent prompt includes: phase instructions, skill to invoke, `pipeline-context.md` content
   c. Wait for agent completion
   d. Update `pipeline-context.md` with phase output
   e. Present results to user
   f. Wait for approval (y/n/abort)
5. Handle retry loops for phases 3-4
6. Clean up `pipeline-context.md` on completion

### Approval UX

At each gate, the user sees:

```
--- Phase 0: Ideation Complete ---
Feature brief:
  [summary of what office-hours produced]

Approve and continue to Design? (y/n/abort)
```

- `y` — advance to next phase
- `n` — re-run current phase (counts as a retry for phases 3-4)
- `abort` — stop pipeline, keep branch and commits intact

### No Background Process

The orchestrator runs as a single conversation. It pauses at gates by asking the user a question. User responds, it continues. No daemon, no cron, no polling.

### Abort Behavior

- Feature branch and all commits remain intact
- `pipeline-context.md` stays for reference
- User can manually continue from where the pipeline stopped
- User can re-trigger `/pipeline` on the same branch to resume (future enhancement)

## Artifacts

**Minimal approach.** The PR is the deliverable. Intermediate files are natural byproducts of the skills:

- `DESIGN.md` — from Phase 1
- `tasks/todo.md` — from Phase 2
- `docs/superpowers/specs/<date>-<feature>-design.md` — from brainstorming within phases
- QA reports in `.gstack/qa-reports/` — from Phase 4

No extra packaging or run directories.

## File Changes

### New Files
- `skills/pipeline/pipeline.md` — orchestrator skill definition
- `.gitignore` entry for `pipeline-context.md`

### No Changes to Existing Files
- All existing gstack skills used as-is
- No modifications to WORKFLOW.md (pipeline implements it, doesn't change it)
