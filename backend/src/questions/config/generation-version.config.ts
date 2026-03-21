/**
 * Semantic version of the question generating logic.
 * Bump when difficulty scoring, diversity, prompts, or answer-type modifiers change.
 *
 * Version history (from git commit dates):
 * - 3.0.0 (2026-03-20): Bug fixes (double date-weight, NEWS throw), unified FAMOUS_PLAYERS_TO_AVOID,
 *   GOSSIP year clamp to last 2 years, RELATIVE_CONTEXTS wired into batch relativity,
 *   GUESS_SCORE/TOP_5 Path A/B diversity anchors, Greek locale gate removed
 * - 1.1.0 (2026-03-14): Easier questions — higher fame, HISTORY exponential date scoring, no HARD board slots
 * - 1.0.0 (2026-03-12): Current — bias toward easier questions, difficulty criteria, DB-backed answer type modifiers
 * - 0.9.1 (6c5cc07): Bias toward easier questions
 * - 0.9.0 (00e2d61): DB-backed answer type modifiers
 * - 0.8.2 (539433d): Tune difficulty weights
 * - 0.8.1 (f5ad03a): Minority scale for entity obscurity
 * - 0.8.0 (2108f5a): Major LLM diversity overhaul
 * - 0.7.0 (262f69a): Bell-curve decay, category & answer-type modifiers
 * - 0.6.0-legacy: Pre-difficulty-overhaul (before 262f69a)
 *
 * Legacy backfill: migration 20260326120000 maps created_at to versions using these commit dates.
 */
export const GENERATION_VERSION = '3.0.1';
