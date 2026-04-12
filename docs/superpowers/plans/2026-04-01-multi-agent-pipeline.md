# Multi-Agent Feature Development Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `/pipeline` skill that chains existing gstack skills through the full feature development workflow with worktree isolation and approval gates.

**Architecture:** A single Claude Code skill file (`SKILL.md`) that acts as an orchestrator. It creates a feature branch, then sequentially dispatches worktree agents — one per phase — with phase-specific prompts. Between phases, it updates a shared `pipeline-context.md` file and pauses for user approval via `AskUserQuestion`.

**Tech Stack:** Claude Code skills (SKILL.md format), Agent tool with `isolation: "worktree"`, AskUserQuestion tool, Bash for git operations.

**Spec:** `docs/superpowers/specs/2026-04-01-multi-agent-pipeline-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| Create: `.claude/skills/pipeline/SKILL.md` | Orchestrator skill — the entire pipeline logic as a skill prompt |
| Modify: `.gitignore` | Add `pipeline-context.md` entry |

This is a single-file deliverable. The skill is a prompt document, not executable code. Claude Code interprets it at invocation time.

---

### Task 1: Add pipeline-context.md to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the gitignore entry**

Add `pipeline-context.md` to `.gitignore` so the ephemeral orchestration state file is never committed:

```
# Pipeline orchestration state (ephemeral)
pipeline-context.md
```

Add this after the existing `# Seed-pool handoff` block (line 30).

- [ ] **Step 2: Verify the entry**

Run: `grep 'pipeline-context' .gitignore`
Expected: `pipeline-context.md`

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore pipeline-context.md"
```

---

### Task 2: Create the pipeline skill — frontmatter and overview

**Files:**
- Create: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p .claude/skills/pipeline
```

- [ ] **Step 2: Write the skill frontmatter and overview section**

Write to `.claude/skills/pipeline/SKILL.md`:

```markdown
---
name: pipeline
description: |
  Multi-agent feature development pipeline. Takes a one-liner feature description
  and drives it through ideation, design, planning, implementation, QA, review,
  and shipping — each phase in an isolated worktree agent with approval gates.
  Use when asked to "pipeline", "run the full workflow", or "build this end to end".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
---

# Multi-Agent Feature Development Pipeline

You are an orchestrator. You drive a feature from a one-liner description through
the full development workflow using existing gstack skills. Each phase runs in an
isolated worktree agent. You pause at every phase boundary for user approval.

## Inputs

The user provides a one-liner feature description as the skill argument.
Example: `/pipeline "Add hardcore mode to logo quiz"`

If no argument is provided, ask the user: "What feature should I build? Give me a one-liner."
```

- [ ] **Step 3: Verify file exists and frontmatter is valid**

Run: `head -15 .claude/skills/pipeline/SKILL.md`
Expected: YAML frontmatter with `name: pipeline` and `allowed-tools` list.

---

### Task 3: Write Phase 0 — Setup and Ideation

**Files:**
- Modify: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Append the setup and Phase 0 sections**

Append to `.claude/skills/pipeline/SKILL.md`:

```markdown

## Step 1: Setup

1. Parse the feature description from the skill args.
2. Slugify it into a branch name (lowercase, hyphens, max 50 chars). Example: "Add hardcore mode to logo quiz" → `feature/add-hardcore-mode-to-logo-quiz`.
3. Create the feature branch:

```bash
git checkout -b feature/<slug> main
```

4. Create `pipeline-context.md` at the repo root with initial content:

```markdown
# Pipeline Context

## Feature
<the user's one-liner>

## Status
Phase 0 — Ideation (pending)
```

5. Commit the context file:

```bash
git add pipeline-context.md
git commit -m "chore: initialize pipeline for <feature slug>"
```

6. Tell the user: "Pipeline initialized on branch `feature/<slug>`. Starting Phase 0: Ideation."

## Phase 0 — Ideation

Dispatch a worktree agent to run `/office-hours` on the feature idea.

**Agent prompt:**
> You are working on the feature: "<feature description>".
> Run `/office-hours` in builder mode to brainstorm this feature.
> When office-hours completes, write a summary of the feature brief (key decisions, scope, success criteria) to a file called `phase-0-output.md` at the repo root.
> Commit all changes.

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After agent completes:**
1. Read `phase-0-output.md` from the feature branch (pull changes if the worktree committed).
2. Update `pipeline-context.md` — add the ideation output under `## Phase 0 — Ideation`.
3. Present the feature brief summary to the user.
4. Ask: "Phase 0 (Ideation) complete. Approve and continue to Design? (y/n/abort)"

**If y:** proceed to Phase 1.
**If n:** re-run Phase 0 with the same agent prompt.
**If abort:** stop the pipeline. Tell the user: "Pipeline aborted. Branch `feature/<slug>` preserved with all work so far."
```

- [ ] **Step 2: Verify the appended content**

Run: `grep -c "Phase 0" .claude/skills/pipeline/SKILL.md`
Expected: at least 3 (heading + references).

---

### Task 4: Write Phase 1 — Design

**Files:**
- Modify: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Append Phase 1 section**

Append to `.claude/skills/pipeline/SKILL.md`:

```markdown

## Phase 1 — Design

Dispatch a worktree agent to run `/design-consultation` informed by the ideation output.

**Agent prompt:**
> You are working on the feature: "<feature description>".
> Here is the ideation output from Phase 0:
> <contents of Phase 0 section from pipeline-context.md>
>
> Run `/design-consultation` to create or update the design system for this feature.
> When complete, write a summary of key design decisions (colors, typography, layout, components) to `phase-1-output.md` at the repo root.
> Commit all changes.

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After agent completes:**
1. Read `phase-1-output.md` from the feature branch.
2. Update `pipeline-context.md` — add design decisions under `## Phase 1 — Design`.
3. Present the design summary to the user.
4. Ask: "Phase 1 (Design) complete. Approve and continue to Planning? (y/n/abort)"

Handle y/n/abort the same as Phase 0.
```

- [ ] **Step 2: Verify**

Run: `grep -c "Phase 1" .claude/skills/pipeline/SKILL.md`
Expected: at least 2.

---

### Task 5: Write Phase 2 — Planning

**Files:**
- Modify: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Append Phase 2 section**

Append to `.claude/skills/pipeline/SKILL.md`:

```markdown

## Phase 2 — Planning

Dispatch a worktree agent to run `/autoplan` with the accumulated context.

**Agent prompt:**
> You are working on the feature: "<feature description>".
> Here is the full pipeline context so far:
> <full contents of pipeline-context.md>
>
> Enter plan mode and create an implementation plan for this feature.
> Then run `/autoplan` to get CEO, engineering, and design reviews on the plan.
> When complete, write a summary of the plan and review outcomes to `phase-2-output.md` at the repo root.
> Commit all changes including the plan file (tasks/todo.md or equivalent).

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After agent completes:**
1. Read `phase-2-output.md` from the feature branch.
2. Update `pipeline-context.md` — add plan summary under `## Phase 2 — Planning`.
3. Present the plan summary and review outcomes to the user.
4. Ask: "Phase 2 (Planning) complete. Approve and continue to Implementation? (y/n/abort)"

Handle y/n/abort the same as Phase 0.
```

- [ ] **Step 2: Verify**

Run: `grep -c "Phase 2" .claude/skills/pipeline/SKILL.md`
Expected: at least 2.

---

### Task 6: Write Phase 3 — Implementation (with retry loop)

**Files:**
- Modify: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Append Phase 3 section**

Append to `.claude/skills/pipeline/SKILL.md`:

```markdown

## Phase 3 — Implementation (retry-enabled, max 3 attempts)

Dispatch a worktree agent to implement the plan.

**Agent prompt:**
> You are working on the feature: "<feature description>".
> Here is the full pipeline context so far:
> <full contents of pipeline-context.md>
>
> Read the implementation plan from the repo (tasks/todo.md or the plan file created in Phase 2).
> Implement the plan task by task. Use TDD where applicable.
> After implementation, verify the build passes:
> - Frontend: `cd frontend && npm run build`
> - Backend: `cd backend && npm run build`
>
> Write a summary of what was built (files created/modified, key decisions) to `phase-3-output.md`.
> Commit all changes with descriptive commit messages.

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After agent completes:**

Check if the build passes by running:
```bash
cd frontend && npm run build && cd ../backend && npm run build
```

**If build passes:**
1. Read `phase-3-output.md` from the feature branch.
2. Update `pipeline-context.md` — add implementation summary under `## Phase 3 — Implementation`.
3. Present the summary to the user.
4. Ask: "Phase 3 (Implementation) complete. Build passes. Approve and continue to Quality? (y/n/abort)"

**If build fails (retry loop):**
1. Capture the build error output.
2. If attempts < 3: re-dispatch a worktree agent with an augmented prompt:
   > The previous implementation attempt failed with the following build errors:
   > <build error output>
   > Fix these errors. Do not re-implement from scratch — fix the existing code.
3. If attempts == 3: escalate to the user:
   > "Phase 3 (Implementation) failed after 3 attempts. Build errors:"
   > <latest build error>
   > "What would you like to do? (retry/abort)"

Handle y/n/abort the same as Phase 0. User saying "n" counts as a retry attempt.
```

- [ ] **Step 2: Verify**

Run: `grep -c "Phase 3" .claude/skills/pipeline/SKILL.md`
Expected: at least 2.

---

### Task 7: Write Phase 4 — Quality (with retry loop)

**Files:**
- Modify: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Append Phase 4 section**

Append to `.claude/skills/pipeline/SKILL.md`:

```markdown

## Phase 4 — Quality (retry-enabled, max 3 attempts)

This phase has two sub-phases run sequentially: QA then Review.

### Phase 4a — QA

Dispatch a worktree agent to run `/qa`.

**Agent prompt:**
> You are working on the feature: "<feature description>".
> Here is the full pipeline context so far:
> <full contents of pipeline-context.md>
>
> Run `/qa` on the application to find and fix bugs.
> When complete, write a summary of QA findings, fixes applied, and the final health score to `phase-4a-output.md`.
> Commit all changes.

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After QA agent completes:**
1. Read `phase-4a-output.md`.
2. If QA reports "not ship-ready" and attempts < 3: re-run QA agent with previous findings as context.
3. If QA reports "not ship-ready" after 3 attempts: escalate to user.
4. If QA passes: proceed to Phase 4b.

### Phase 4b — Code Review

Dispatch a worktree agent to run `/review`.

**Agent prompt:**
> You are working on the feature: "<feature description>".
> Here is the full pipeline context so far:
> <full contents of pipeline-context.md>
>
> Run `/review` on the diff between `main` and the current branch.
> When complete, write a summary of review findings to `phase-4b-output.md`.
> Commit any fixes.

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After review agent completes:**
1. Read `phase-4b-output.md`.
2. Check for CRITICAL findings. If CRITICAL findings remain and attempts < 3: re-run with findings as context.
3. If CRITICAL after 3 attempts: escalate to user.

**After both sub-phases pass:**
1. Update `pipeline-context.md` — add QA and review summaries under `## Phase 4 — Quality`.
2. Present combined quality summary to the user.
3. Ask: "Phase 4 (Quality) complete. Approve and continue to Ship? (y/n/abort)"

Handle y/n/abort the same as Phase 0.
```

- [ ] **Step 2: Verify**

Run: `grep -c "Phase 4" .claude/skills/pipeline/SKILL.md`
Expected: at least 4 (heading + sub-phases + references).

---

### Task 8: Write Phase 5 — Ship

**Files:**
- Modify: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Append Phase 5 section**

Append to `.claude/skills/pipeline/SKILL.md`:

```markdown

## Phase 5 — Ship

Dispatch a worktree agent to run `/ship`.

**Agent prompt:**
> You are working on the feature: "<feature description>".
> You are on branch `feature/<slug>`.
> Run `/ship` to create a pull request for this feature.
> When complete, write the PR URL to `phase-5-output.md`.
> Commit any changelog/version changes.

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After agent completes:**
1. Read `phase-5-output.md` to get the PR URL.
2. Update `pipeline-context.md` — add PR URL under `## Phase 5 — Ship`.
3. Present the PR URL to the user.
4. Ask: "Phase 5 (Ship) complete. PR created: <URL>. Merge the PR manually, then type 'y' to continue to Post-Ship, or 'done' to end the pipeline."

**If y:** proceed to Phase 6.
**If done:** end the pipeline. Tell the user: "Pipeline complete. PR ready for merge: <URL>"
```

- [ ] **Step 2: Verify**

Run: `grep -c "Phase 5" .claude/skills/pipeline/SKILL.md`
Expected: at least 2.

---

### Task 9: Write Phase 6 — Post-Ship

**Files:**
- Modify: `.claude/skills/pipeline/SKILL.md`

- [ ] **Step 1: Append Phase 6 section**

Append to `.claude/skills/pipeline/SKILL.md`:

```markdown

## Phase 6 — Post-Ship

Dispatch a worktree agent to run `/document-release`.

**Agent prompt:**
> The feature "<feature description>" has been shipped and merged to main.
> Run `/document-release` to update all project documentation to reflect what shipped.
> Commit all documentation changes to main.

Use the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`.

**After agent completes:**
1. Tell the user: "Pipeline complete. Feature shipped and documented."
2. Clean up: delete `pipeline-context.md` if it still exists.

## Abort Handling

At any point, if the user types "abort":
1. Stop the pipeline immediately.
2. Do NOT delete the feature branch or any commits.
3. Do NOT delete `pipeline-context.md` — it serves as a reference for what was decided.
4. Tell the user: "Pipeline aborted at Phase <N>. Branch `feature/<slug>` preserved with all work so far. You can continue manually or re-run `/pipeline` later."

## Error Recovery

If an agent fails unexpectedly (crashes, times out, or returns no output):
1. Do NOT auto-retry for phases 0-2. Present the error and ask the user what to do.
2. For phases 3-4: treat as a failed attempt in the retry loop.
3. For phases 5-6: present the error and ask the user what to do.

Always preserve the feature branch and all commits regardless of failure mode.
```

- [ ] **Step 2: Verify the complete skill file**

Run: `wc -l .claude/skills/pipeline/SKILL.md`
Expected: approximately 180-220 lines.

Run: `grep -c "^## " .claude/skills/pipeline/SKILL.md`
Expected: 10-12 (all major sections present).

- [ ] **Step 3: Commit the skill file**

```bash
git add .claude/skills/pipeline/SKILL.md
git commit -m "feat: add /pipeline multi-agent orchestrator skill"
```

---

### Task 10: Smoke test the skill

**Files:**
- Read: `.claude/skills/pipeline/SKILL.md` (verification only)

- [ ] **Step 1: Verify the skill is discoverable**

Run: `ls -la .claude/skills/pipeline/SKILL.md`
Expected: File exists with reasonable size (3-6KB).

- [ ] **Step 2: Verify frontmatter parses correctly**

Run: `head -20 .claude/skills/pipeline/SKILL.md`
Expected: Valid YAML frontmatter with `name: pipeline`, `description`, and `allowed-tools` containing `Agent` and `AskUserQuestion`.

- [ ] **Step 3: Verify all phases are referenced**

Run: `grep -c "^## Phase" .claude/skills/pipeline/SKILL.md`
Expected: 7 (Phase 0 through Phase 6, with 4a/4b as sub-headings).

- [ ] **Step 4: Verify retry logic is present**

Run: `grep -c "retry" .claude/skills/pipeline/SKILL.md`
Expected: at least 5 references to retry behavior.

- [ ] **Step 5: Verify pipeline-context.md is gitignored**

Run: `grep 'pipeline-context' .gitignore`
Expected: `pipeline-context.md`

- [ ] **Step 6: Final commit if any verification fixes were needed**

Only if changes were made during verification:
```bash
git add -A
git commit -m "fix: address pipeline skill verification findings"
```
