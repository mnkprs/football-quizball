import type { QuestionCategory } from '../../common/interfaces/question.interface';
import type { EntityType } from '../classifiers/canonical-entities';

/**
 * Per-category list of canonical entity types that are appropriate targets
 * for entity-scarcity steering. Used by EntityScarcityService to filter the
 * canonical entity index before computing underused candidates.
 *
 * PLAYER_ID is intentionally players-only — the category asks about player
 * identity, so steering toward teams/trophies would produce off-topic output.
 * Categories without a mapping (NEWS, MAYHEM, LOGO_QUIZ) are not seeded via
 * the standard generator path and therefore skip entity steering.
 */
export const CATEGORY_ENTITY_TYPES: Partial<Record<QuestionCategory, EntityType[]>> = {
  HISTORY: ['player', 'team', 'trophy', 'league', 'manager'],
  PLAYER_ID: ['player'],
  HIGHER_OR_LOWER: ['player', 'team'],
  GUESS_SCORE: ['team', 'trophy', 'league'],
  TOP_5: ['player', 'team', 'league'],
  GEOGRAPHY: ['country', 'team', 'player', 'stadium'],
  GOSSIP: ['player', 'team', 'manager'],
};
