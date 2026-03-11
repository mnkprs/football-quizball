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

export type { QuestionCategory, Difficulty, QuestionLocale, QuestionTranslation, AnswerType, DifficultyFactors, GeneratedQuestion, BoardCell, Top5Entry, Top5Progress };

export const LEAGUE_FAMILIARITY_TIERS: Record<string, number> = {
  // Tier 1
  'UEFA Champions League': 1,
  'FIFA World Cup': 1,
  'Premier League': 1,
  'Greek Super League': 1,
  'Super League Greece': 1,
  'La Liga': 1,
  'Bundesliga': 1,
  'Serie A': 1,
  'UEFA Europa League': 1,
  // Tier 2
  'Ligue 1': 2,
  'Primeira Liga': 2,
  'Eredivisie': 2,
  'UEFA Conference League': 2,
  'FA Cup': 2,
  'Copa del Rey': 2,
  // Tier 3
  'Scottish Premiership': 3,
  'Turkish Süper Lig': 3,
  'Brasileirão': 3,
  'MLS': 3,
  'Belgian Pro League': 3,
  // Tier 4
  'Saudi Pro League': 4,
  'Chinese Super League': 4,
  'Egyptian Premier League': 4,
  'Mexican Liga MX': 4,
  // Tier 5
  'Indian Super League': 5,
};

export const CATEGORY_DIFFICULTY_SLOTS: Record<QuestionCategory, readonly Difficulty[]> = {
  HISTORY: ['EASY', 'MEDIUM', 'HARD'],
  PLAYER_ID: ['MEDIUM', 'MEDIUM'],
  HIGHER_OR_LOWER: ['MEDIUM', 'MEDIUM'],
  GUESS_SCORE: ['EASY', 'MEDIUM', 'HARD'],
  TOP_5: ['HARD', 'HARD'],
  GEOGRAPHY: ['EASY', 'MEDIUM', 'HARD'],
  GOSSIP: ['MEDIUM', 'MEDIUM'],
  NEWS: ['MEDIUM', 'MEDIUM'],
};

export const CATEGORY_BATCH_SIZES: Partial<Record<QuestionCategory, number>> = {
  HISTORY: 3,
  PLAYER_ID: 2,
  HIGHER_OR_LOWER: 2,
  GUESS_SCORE: 3,
  TOP_5: 2,
  GEOGRAPHY: 3,
  GOSSIP: 2,
};

export const CATEGORY_FIXED_DIFFICULTY: Partial<Record<QuestionCategory, Difficulty>> = {
  PLAYER_ID: 'MEDIUM',
  HIGHER_OR_LOWER: 'MEDIUM',
  TOP_5: 'HARD',
  GOSSIP: 'MEDIUM',
};

export const DIFFICULTY_POINTS: Record<Difficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

const CATEGORY_POINT_OVERRIDES: Partial<Record<QuestionCategory, number>> = {
  TOP_5: 3,
  GOSSIP: 2,
};

export function resolveQuestionPoints(category: QuestionCategory, difficulty: Difficulty): number {
  return CATEGORY_POINT_OVERRIDES[category] ?? DIFFICULTY_POINTS[difficulty];
}

function getDirectTier(tiers: Record<string, number> | undefined, competition: string): number | null {
  if (!tiers) return null;
  return tiers[competition] ?? null;
}

function getMatchedTier(tiers: Record<string, number> | undefined, competition: string): number | null {
  if (!tiers) return null;
  const lower = competition.toLowerCase();
  for (const [key, tier] of Object.entries(tiers)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return tier;
    }
  }
  return null;
}

export function getLeagueFamiliarityTier(
  competition: string,
): number {
  const directDefaultTier = getDirectTier(LEAGUE_FAMILIARITY_TIERS, competition);
  if (directDefaultTier !== null) return directDefaultTier;

  const matchedDefaultTier = getMatchedTier(LEAGUE_FAMILIARITY_TIERS, competition);
  if (matchedDefaultTier !== null) return matchedDefaultTier;

  return 3;
}

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  HISTORY: 'History',
  PLAYER_ID: 'Player ID',
  HIGHER_OR_LOWER: 'Higher or Lower',
  GUESS_SCORE: 'Guess the Score',
  TOP_5: 'Top 5',
  GEOGRAPHY: 'Geography',
  GOSSIP: 'Gossip',
  NEWS: 'News',
};

export const CATEGORY_LABELS_EL: Record<QuestionCategory, string> = {
  HISTORY: 'Ιστορία',
  PLAYER_ID: 'Αναγνώριση Παίκτη',
  HIGHER_OR_LOWER: 'Υψηλότερο ή Χαμηλότερο',
  GUESS_SCORE: 'Μάντεψε το Σκορ',
  TOP_5: 'Top 5',
  GEOGRAPHY: 'Γεωγραφία',
  GOSSIP: 'Gossip',
  NEWS: 'Νέα',
};
