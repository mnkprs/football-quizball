import type { QuestionCategory } from '../../common/interfaces/question.interface';

/**
 * Shared context types for batch relativity (questions in a batch share context type, not object).
 */
export const RELATIVE_CONTEXTS: Partial<Record<QuestionCategory, readonly string[]>> = {
  HISTORY: [
    'domestic cup finals',
    'title deciders',
    'European knockout ties',
    'international tournament knockout matches',
  ],
  PLAYER_ID: [
    'players known for a particular career path pattern',
    'players associated with a well-known football era',
    'players linked by club-to-club movement themes',
  ],
  HIGHER_OR_LOWER: [
    'single-season league statistics',
    'domestic cup statistics',
    'European competition statistics',
  ],
  GUESS_SCORE: [
    'domestic cup finals',
    'World Cup knockout matches',
    'European knockout matches',
  ],
  TOP_5: [
    'domestic cup finals',
    'league-season rankings',
    'European competition records',
  ],
  GEOGRAPHY: [
    'major tournament host contexts',
    'stadium and city contexts',
    'club geography within well-known leagues',
  ],
  GOSSIP: [
    'transfer sagas',
    'manager-player feuds',
    'viral press conference moments',
  ],
};
