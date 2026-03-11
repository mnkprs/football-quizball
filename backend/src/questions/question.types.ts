/**
 * Re-exports question types and config for backward compatibility.
 * New code should import from common/interfaces and questions/config directly.
 */
import {
  QuestionCategory,
  Difficulty,
  QuestionLocale,
  QuestionTranslation,
  AnswerType,
  DifficultyFactors,
  GeneratedQuestion,
  BoardCell,
  Top5Entry,
  Top5Progress,
} from '../common/interfaces/question.interface';
import {
  LEAGUE_FAMILIARITY_TIERS,
  getLeagueFamiliarityTier,
  CATEGORY_DIFFICULTY_SLOTS,
  CATEGORY_BATCH_SIZES,
  CATEGORY_FIXED_DIFFICULTY,
  DIFFICULTY_POINTS,
  resolveQuestionPoints,
  CATEGORY_LABELS,
  CATEGORY_LABELS_EL,
} from './config';

export type { QuestionCategory, Difficulty, QuestionLocale, QuestionTranslation, AnswerType, DifficultyFactors, GeneratedQuestion, BoardCell, Top5Entry, Top5Progress };

export {
  LEAGUE_FAMILIARITY_TIERS,
  getLeagueFamiliarityTier,
  CATEGORY_DIFFICULTY_SLOTS,
  CATEGORY_BATCH_SIZES,
  CATEGORY_FIXED_DIFFICULTY,
  DIFFICULTY_POINTS,
  resolveQuestionPoints,
  CATEGORY_LABELS,
  CATEGORY_LABELS_EL,
};
