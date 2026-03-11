import type { ExplicitConstraintsResult } from '../../common/interfaces/diversity.interface';
import {
  YEAR_RANGES,
  NATIONALITIES,
  COMPETITIONS,
  POSITIONS,
  STAT_TYPES,
  REGIONS,
  GEOGRAPHY_ENTITY_TYPES,
  GOSSIP_TOPICS,
  QUESTION_ANGLES,
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

/**
 * Builds 2–4 diversity constraints for a category.
 * 70% entity injection + angle, 30% traditional dimension constraints.
 */
export function pickConstraints(category: string, slotIndex?: number, minorityScale?: number): string[] {
  const constraints: string[] = [];
  const useIndex = (offset: number) =>
    slotIndex !== undefined ? (slotIndex + offset) % 100 : undefined;

  const useEntityInjection = Math.random() < 0.7;

  if (useEntityInjection) {
    const entityType = entityTypeForCategory(category);
    const scale = minorityScale ?? (category === 'GUESS_SCORE' ? randomInRange(65, 95) : randomInRange(25, 85));
    const angles = QUESTION_ANGLES[category] ?? [];
    const angle = angles.length ? pick(angles as readonly string[], useIndex(1)) : null;

    const obscureHint = category === 'GUESS_SCORE'
      ? 'Pick a well-known match involving this entity.'
      : 'Before writing the question, mentally recall 2 unusual or lesser-known facts about this entity, then use the most interesting one.';
    let entityConstraint = `Pick a football ${entityType} at obscurity level ${scale}/100 (where 1 = extremely obscure/niche, 100 = universally famous worldwide). The question MUST specifically involve this entity. ${obscureHint}`;
    if (angle) {
      entityConstraint += ` The specific angle MUST be: ${angle}.`;
    }
    constraints.push(entityConstraint);

    if (Math.random() < 0.6) {
      const addYear = Math.random() < 0.5;
      if (addYear) {
        constraints.push(`Choose a specific year that is historically significant for this entity and focus on an event from that year.`);
      } else {
        constraints.push(`The context MUST relate to ${pick(COMPETITIONS, useIndex(2))}.`);
      }
    }

    return constraints;
  }

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
      constraints.push(`The match MUST be from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The match MUST involve ${pick(COMPETITIONS, useIndex(1))}.`);
      constraints.push(`The angle MUST be: ${pick(QUESTION_ANGLES.GUESS_SCORE, useIndex(2))}.`);
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
