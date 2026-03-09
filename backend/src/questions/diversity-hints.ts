/**
 * Explicit diversity constraints to inject into LLM prompts.
 * Each call returns 1–2 mandatory constraints so the model produces varied questions
 * instead of converging on similar outputs when given identical prompts.
 */

const YEAR_RANGES = [
  'pre-1980',
  '1980', '1981', '1982', '1983', '1984', '1985', '1986', '1987', '1988', '1989',
  '1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999',
  '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009',
  '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
  '2020', '2021', '2022', '2023', '2024',
];

const NATIONALITIES = [
  'Brazil',
  'Argentina',
  'France',
  'Germany',
  'Spain',
  'Italy',
  'African',
  'Asian',
  'Eastern European',
  'Scandinavian',
  'Dutch or Belgian',
  'Portuguese',
  'Greek'
];

const COMPETITIONS = [
  'FIFA World Cup',
  'UEFA European Championship',
  'UEFA Champions League',
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Copa América',
  'domestic cup final (FA Cup, Copa del Rey, etc.)',
  'Latin American club football',
  'lesser-known European league (Eredivisie, Primeira Liga, Turkish Süper Lig)',
];

const REGIONS = [
  'Europe',
  'South America',
  'Africa',
  'Asia',
  'North America',
];

const POSITIONS = [
  'goalkeeper',
  'right-back',
  'left-back',
  'centre-back',
  'defensive midfielder',
  'central midfielder',
  'attacking midfielder',
  'right winger',
  'left winger',
  'striker',
];

const STAT_TYPES = [
  'goals',
  'assists',
  'caps or appearances',
  'clean sheets',
  'transfer fee',
  'trophies won',
  'yellow or red cards',
  'minutes played or games started',
  'winning or decisive goals',
  'hat-tricks or braces',
  'clean sheet streak',
  'international caps',
];

const GEOGRAPHY_ENTITY_TYPES = [
  'country or national team',
  'city and its clubs',
  'stadium or venue',
  'confederation or regional football',
  'club rivalry or derby city',
  'host nation of a major tournament',
  'league or domestic structure',
  'youth academy or footballing region',
  'continental qualification zone',
];

const GOSSIP_TOPICS = [
  'transfer saga',
  'controversy or incident',
  'celebrity or lifestyle story',
  'feud or rivalry off the pitch',
  'retirement or comeback',
  'injury saga or medical drama',
  'manager feud or sack story',
  'social media or interview controversy',
  'lifestyle or charity work',
  'legal or disciplinary incident',
];

function pick<T>(arr: readonly T[], index?: number): T {
  if (index !== undefined && index >= 0) {
    return arr[index % arr.length];
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Picks 1–2 constraints for a category. Uses slotIndex for deterministic selection when filling in parallel. */
function pickConstraints(
  category: string,
  slotIndex?: number,
): string[] {
  const constraints: string[] = [];
  const useIndex = (offset: number) =>
    slotIndex !== undefined ? (slotIndex + offset) % 100 : undefined;

  switch (category) {
    case 'HISTORY': {
      constraints.push(`The question MUST be about events from ${pick(YEAR_RANGES, useIndex(0))}.`);
      if (Math.random() < 0.5 || slotIndex !== undefined) {
        constraints.push(`The topic MUST involve ${pick(COMPETITIONS, useIndex(1))}.`);
      }
      break;
    }
    case 'PLAYER_ID': {
      constraints.push(`The player MUST be from ${pick(NATIONALITIES, useIndex(0))}.`);
      if (Math.random() < 0.5 || slotIndex !== undefined) {
        constraints.push(`The player MUST be a ${pick(POSITIONS, useIndex(1))}.`);
      }
      break;
    }
    case 'HIGHER_OR_LOWER': {
      constraints.push(`The stat MUST be about ${pick(STAT_TYPES, useIndex(0))}.`);
      if (slotIndex !== undefined || Math.random() < 0.5) {
        constraints.push(
          (slotIndex !== undefined ? slotIndex % 2 === 0 : Math.random() < 0.5)
            ? `The player MUST be from ${pick(NATIONALITIES, useIndex(1))}.`
            : `The stat MUST be from ${pick(COMPETITIONS, useIndex(2))}.`,
        );
      }
      break;
    }
    case 'GUESS_SCORE': {
      constraints.push(`The match MUST be from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The match MUST involve ${pick(COMPETITIONS, useIndex(1))}.`);
      break;
    }
    case 'TOP_5': {
      constraints.push(
        (slotIndex !== undefined ? slotIndex % 2 === 0 : Math.random() < 0.5)
          ? `The ranking MUST be from ${pick(COMPETITIONS, useIndex(0))}.`
          : `The ranking MUST involve ${pick(NATIONALITIES, useIndex(1))} players.`,
      );
      constraints.push(`The stat type MUST be ${pick(STAT_TYPES, useIndex(2))}.`);
      break;
    }
    case 'GEOGRAPHY': {
      constraints.push(`The question MUST be about a ${pick(GEOGRAPHY_ENTITY_TYPES, useIndex(0))}.`);
      constraints.push(`The focus MUST be in ${pick(REGIONS, useIndex(1))}.`);
      break;
    }
    case 'GOSSIP': {
      constraints.push(`The story MUST be from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The topic MUST be a ${pick(GOSSIP_TOPICS, useIndex(1))}.`);
      break;
    }
    default:
      constraints.push(`Focus on ${pick(YEAR_RANGES, useIndex(0))} or ${pick(COMPETITIONS, useIndex(1))}.`);
  }

  return constraints.slice(0, 2);
}

export interface ExplicitConstraintsResult {
  promptPart: string;
  constraints: string[];
}

/**
 * Returns mandatory diversity constraints to append to the user prompt.
 * Use slotIndex when filling pool in parallel so each call gets different constraints.
 * Also returns constraints array for logging.
 */
export function getExplicitConstraintsWithMeta(category: string, slotIndex?: number): ExplicitConstraintsResult {
  const constraints = pickConstraints(category, slotIndex);
  const promptPart = constraints.length === 0 ? '' : `\n\nMANDATORY: ${constraints.join(' ')}`;
  return { promptPart, constraints };
}

/** Returns only the prompt string (backward compatible). */
export function getExplicitConstraints(category: string, slotIndex?: number): string {
  return getExplicitConstraintsWithMeta(category, slotIndex).promptPart;
}

/** @deprecated Use getExplicitConstraints for stronger diversity. Kept for backward compatibility. */
export function getDiversityHints(category: string): string {
  return getExplicitConstraints(category);
}

/** Returns an "avoid" instruction if answers to avoid are provided. */
export function getAvoidInstruction(avoidAnswers: string[] | undefined): string {
  if (!avoidAnswers?.length) return '';
  const sample = avoidAnswers.slice(0, 25).join(', ');
  const suffix = avoidAnswers.length > 25 ? ` (and ${avoidAnswers.length - 25} more)` : '';
  return `\n\nIMPORTANT: Do NOT generate questions with these answers — pick something different: ${sample}${suffix}`;
}
