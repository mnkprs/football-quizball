/**
 * Re-exports diversity utilities for backward compatibility.
 * New code should import from ./diversity directly.
 */
export {
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
  getAvoidInstruction,
} from './diversity/prompt-helpers';
export {
  minorityScaleForDifficulty,
  minorityScaleForElo,
  difficultyRangeForElo,
} from './diversity/minority-scale';
export {
  getExplicitConstraintsWithMeta,
  getExplicitConstraints,
  getDiversityHints,
} from './diversity/constraint-builder';
