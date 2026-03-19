import type { ExplicitConstraintsResult } from '../../common/interfaces/diversity.interface';
import {
  YEAR_RANGES,
  NATIONALITIES,
  COMPETITIONS,
  POSITIONS,
  STAT_TYPES,
  REGIONS,
  GEOGRAPHY_ENTITY_TYPES,
  GEOGRAPHY_QUESTION_PATTERNS,
  GOSSIP_TOPICS,
  QUESTION_ANGLES,
  SQUAD_ROLES,
  FAMOUS_PLAYERS_TO_AVOID,
} from './diversity-dimensions.config';

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[], index?: number): T {
  if (index !== undefined && index >= 0) {
    return arr[index % arr.length];
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

function entityTypeForCategory(category: string): string {
  switch (category) {
    case 'PLAYER_ID':
    case 'HIGHER_OR_LOWER': return 'player';
    case 'GOSSIP': return 'player or manager/coach';
    case 'GUESS_SCORE': return 'club';
    case 'GEOGRAPHY': return 'stadium, club, or city';
    default: return 'player or club';
  }
}

/** Returns a short sample of famous players to avoid, for embedding in constraints. */
function famousPlayersAvoidText(): string {
  const sample = (FAMOUS_PLAYERS_TO_AVOID as readonly string[]).slice(0, 12).join(', ');
  return `NOT any of: ${sample} (or similarly universally famous players)`;
}

/**
 * Builds 2–4 diversity constraints for a category.
 *
 * Three paths are used to maximise variety across multiple seed-pool runs:
 *  - Path A (40%): squad-role + nationality + competition anchor — forces non-star player targeting
 *  - Path B (30%): squad-role + season-moment anchor — focuses on a specific career moment type
 *  - Path C (30%): traditional dimension constraints (year/position/angle)
 *
 * The previous "obscurity level X/100" numeric scale has been replaced with qualitative role
 * descriptions because LLMs interpret numeric scales relative to their biased training distribution,
 * reliably landing on famous players even at low obscurity values.
 */
export function pickConstraints(category: string, slotIndex?: number, minorityScale?: number): string[] {
  const constraints: string[] = [];
  const useIndex = (offset: number) =>
    slotIndex !== undefined ? (slotIndex + offset) % 100 : undefined;

  const rand = Math.random();
  const useSquadRoleNationalityAnchor = rand < 0.40;
  const useSquadRoleMomentAnchor = rand < 0.70; // covers 0.40–0.70

  // Path A: squad-role + nationality + competition anchor (player-centric categories)
  if (useSquadRoleNationalityAnchor && ['PLAYER_ID', 'HIGHER_OR_LOWER', 'HISTORY', 'GOSSIP'].includes(category)) {
    const role = pick(SQUAD_ROLES, useIndex(0));
    const nationality = pick(NATIONALITIES, useIndex(1));
    const competition = pick(COMPETITIONS, useIndex(2));
    const entityType = entityTypeForCategory(category);
    const avoidText = famousPlayersAvoidText();

    if (category === 'PLAYER_ID') {
      constraints.push(
        `Pick a ${nationality} footballer who served as a "${role}" — ${avoidText}. ` +
        `The player MUST have appeared in ${competition} or a comparable Tier-1 context. ` +
        `Think beyond the first names that come to mind — choose someone fans of that league would recognise but who rarely appears in trivia.`,
      );
    } else if (category === 'HIGHER_OR_LOWER') {
      constraints.push(
        `The stat MUST belong to a ${nationality} footballer playing as a "${role}". ` +
        `${avoidText}. Use a stat from ${competition} or equivalent.`,
      );
    } else {
      constraints.push(
        `Focus on a ${nationality} football ${entityType} in the role of "${role}". ${avoidText}.`,
      );
      constraints.push(`The context MUST relate to ${competition}.`);
    }

    const angles = QUESTION_ANGLES[category] ?? [];
    if (angles.length) {
      constraints.push(`The angle MUST be: ${pick(angles as readonly string[], useIndex(3))}.`);
    }
    return constraints;
  }

  // Path B: squad-role + season-moment anchor (all player-centric categories)
  if (useSquadRoleMomentAnchor && ['PLAYER_ID', 'HIGHER_OR_LOWER', 'HISTORY', 'GOSSIP'].includes(category)) {
    const role = pick(SQUAD_ROLES, useIndex(0));
    const avoidText = famousPlayersAvoidText();
    const competition = pick(COMPETITIONS, useIndex(2));

    constraints.push(
      `Think of a football ${entityTypeForCategory(category)} who was a "${role}" — someone known within their league or club but not a global superstar. ${avoidText}.`,
    );
    constraints.push(`The question MUST relate to ${competition} or a comparable well-known competition.`);

    const angles = QUESTION_ANGLES[category] ?? [];
    if (angles.length) {
      constraints.push(`The specific angle MUST be: ${pick(angles as readonly string[], useIndex(1))}.`);
    }
    return constraints;
  }

  // Path C: traditional dimension-based constraints (original logic, kept for variety)
  switch (category) {
    case 'HISTORY': {
      constraints.push(`The question MUST be about events from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The topic MUST involve ${pick(COMPETITIONS, useIndex(1))}.`);
      constraints.push(`The angle MUST be: ${pick(QUESTION_ANGLES.HISTORY, useIndex(2))}.`);
      break;
    }
    case 'PLAYER_ID': {
      constraints.push(`The player MUST be ${pick(NATIONALITIES, useIndex(0))}.`);
      constraints.push(`The player MUST be a ${pick(POSITIONS, useIndex(1))}.`);
      constraints.push(`The angle MUST be: ${pick(QUESTION_ANGLES.PLAYER_ID, useIndex(2))}.`);
      constraints.push(`${famousPlayersAvoidText()}.`);
      break;
    }
    case 'HIGHER_OR_LOWER': {
      constraints.push(`The stat MUST be about ${pick(STAT_TYPES, useIndex(0))}.`);
      const addNationality = (slotIndex !== undefined ? slotIndex % 2 === 0 : Math.random() < 0.5);
      constraints.push(
        addNationality
          ? `The player MUST be ${pick(NATIONALITIES, useIndex(1))}.`
          : `The stat MUST be from ${pick(COMPETITIONS, useIndex(1))}.`,
      );
      constraints.push(`The angle MUST be: ${pick(QUESTION_ANGLES.HIGHER_OR_LOWER, useIndex(2))}.`);
      break;
    }
    case 'GUESS_SCORE': {
      constraints.push(`Prefer match from ${pick(YEAR_RANGES, useIndex(0))} — but only if you can verify the score via search.`);
      constraints.push(`Prefer ${pick(COMPETITIONS, useIndex(1))} — relax if no verified match fits.`);
      constraints.push(`Prefer angle: ${pick(QUESTION_ANGLES.GUESS_SCORE, useIndex(2))}.`);
      constraints.push(`If constraints cannot be satisfied with a verified match, relax them and pick any match whose score is explicitly confirmed in search.`);
      break;
    }
    case 'TOP_5': {
      const useCompetition = (slotIndex !== undefined ? slotIndex % 2 === 0 : Math.random() < 0.5);
      constraints.push(
        useCompetition
          ? `The ranking MUST be from ${pick(COMPETITIONS, useIndex(0))}.`
          : `The ranking MUST involve ${pick(NATIONALITIES, useIndex(1))} players.`,
      );
      constraints.push(`The stat type MUST be ${pick(STAT_TYPES, useIndex(2))}.`);
      constraints.push(`The angle MUST be: ${pick(QUESTION_ANGLES.TOP_5, useIndex(3))}.`);
      break;
    }
    case 'GEOGRAPHY': {
      constraints.push(`The question MUST be about a ${pick(GEOGRAPHY_ENTITY_TYPES, useIndex(0))}.`);
      constraints.push(`The question MUST start with or use the phrasing: "${pick(GEOGRAPHY_QUESTION_PATTERNS, useIndex(3))}" — do NOT default to "Which country hosted...".`);
      constraints.push(`The focus MUST be in ${pick(REGIONS, useIndex(1))}.`);
      constraints.push(`The angle MUST be: ${pick(QUESTION_ANGLES.GEOGRAPHY, useIndex(2))}.`);
      break;
    }
    case 'GOSSIP': {
      constraints.push(`The story MUST be from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The topic MUST be a ${pick(GOSSIP_TOPICS, useIndex(1))}.`);
      constraints.push(`The angle MUST be: ${pick(QUESTION_ANGLES.GOSSIP, useIndex(2))}.`);
      break;
    }
    default:
      constraints.push(`Focus on ${pick(YEAR_RANGES, useIndex(0))} or ${pick(COMPETITIONS, useIndex(1))}.`);
  }

  return constraints;
}

/**
 * Returns mandatory diversity constraints to append to the user prompt.
 */
export function getExplicitConstraintsWithMeta(category: string, slotIndex?: number, minorityScale?: number): ExplicitConstraintsResult {
  const constraints = pickConstraints(category, slotIndex, minorityScale);
  const promptPart = constraints.length === 0 ? '' : `\n\nMANDATORY CONSTRAINTS:\n${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
  return { promptPart, constraints };
}

/** Returns only the prompt string. */
export function getExplicitConstraints(category: string, slotIndex?: number, minorityScale?: number): string {
  return getExplicitConstraintsWithMeta(category, slotIndex, minorityScale).promptPart;
}

/** @deprecated Use getExplicitConstraints. Kept for backward compatibility. */
export function getDiversityHints(category: string): string {
  return getExplicitConstraints(category);
}
