import { Difficulty } from './question.types';

/**
 * Explicit diversity constraints to inject into LLM prompts.
 * Techniques used:
 * 1. Minority scale injection — LLM picks entity at a given obscurity level (1–100)
 * 2. Question angle constraints — force unusual framing, not just topic
 * 3. Global anti-convergence blacklist — ban the LLM's most-cached pub quiz tropes
 * 4. Cross-dimension stacking — combine entity + angle + era/competition simultaneously
 * 5. Chain-of-thought brainstorm — ask model to surface facts before writing the question
 */


// ─── Dimension Lists ───────────────────────────────────────────────────────────

const YEAR_RANGES = [
  'pre-1960', '1960s', '1970s',
  '1980', '1981', '1982', '1983', '1984', '1985', '1986', '1987', '1988', '1989',
  '1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999',
  '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009',
  '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
  '2020', '2021', '2022', '2023', '2024', '2025',
] as const;

const NATIONALITIES = [
  'Brazilian', 'Argentine', 'French', 'German', 'Spanish', 'Italian',
  'African (any nation)', 'Asian (any nation)', 'Eastern European',
  'Scandinavian', 'Dutch or Belgian', 'Portuguese', 'Greek',
  'Croatian or Serbian', 'Mexican or Central American',
  'Colombian or Venezuelan', 'Uruguayan or Paraguayan',
  'Scottish or Irish', 'Turkish', 'Polish or Czech',
] as const;

const COMPETITIONS = [
  'FIFA World Cup',
  'UEFA European Championship',
  'UEFA Champions League',
  'UEFA Cup / UEFA Europa League',
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'Primeira Liga (Portugal)',
  'Eredivisie',
  'Copa América',
  'CONMEBOL Libertadores',
  'CONMEBOL Sudamericana',
  'CAF Champions League',
  'AFC Champions League',
  'domestic cup final (FA Cup, Copa del Rey, DFB-Pokal, etc.)',
  'lesser-known European league (Turkish Süper Lig, Scottish Premiership, Greek Super League)',
  'FIFA Club World Cup',
  'UEFA Super Cup',
] as const;

const POSITIONS = [
  'goalkeeper', 'right-back', 'left-back', 'centre-back',
  'defensive midfielder', 'central midfielder', 'attacking midfielder',
  'right winger', 'left winger', 'striker', 'second striker',
] as const;

const STAT_TYPES = [
  'goals scored', 'assists', 'international caps', 'clean sheets',
  'transfer fee paid', 'trophies won', 'yellow or red cards received',
  'hat-tricks', 'winning goals', 'penalty kicks scored or missed',
  'clean sheet streak', 'consecutive league appearances',
  'minutes played in a single tournament', 'saves made in a season',
] as const;

const REGIONS = ['Europe', 'South America', 'Africa', 'Asia', 'North & Central America'] as const;

const GEOGRAPHY_ENTITY_TYPES = [
  'national team from an unusual or unexpected country',
  'city famous for football rivalry between two clubs',
  'historically significant stadium or venue',
  'confederation or regional football body',
  'host nation of a major tournament',
  'domestic league structure or promotion/relegation system',
  'youth academy or player development region',
  'country with unusual FIFA ranking history',
] as const;

const GOSSIP_TOPICS = [
  'transfer saga that dragged over multiple windows',
  'public feud between a player and their manager',
  'viral interview or press conference moment',
  'off-pitch legal or disciplinary incident',
  'shock retirement or unexpected comeback announcement',
  'celebrity relationship that influenced a transfer decision',
  'social media controversy or post that went viral',
  'contract dispute that ended a long club relationship',
  'injury saga with a dramatic recovery story',
  'manager sacking with controversial timing',
] as const;

// ─── Question Angles (what makes this question interesting) ───────────────────

const QUESTION_ANGLES: Record<string, readonly string[]> = {
  HISTORY: [
    'a record that was set or broken',
    'the first time something happened in football',
    'an own goal that changed the outcome',
    'a penalty miss in a high-stakes match',
    'a red card that altered the result',
    'a substitute who scored a decisive goal',
    'a giant-killing upset against a heavily favored team',
    'a comeback from a multi-goal deficit',
    'a match decided by a single controversial decision',
    'a match played in unusual or extreme circumstances',
    'the final game or appearance of a legendary era',
    'a tournament or competition inaugurated for the first time',
    'a hat-trick or extraordinary individual performance',
    'a goalless match that had significant consequences',
  ],
  PLAYER_ID: [
    'a player who represented multiple national teams in their career',
    'a one-club legend who played there for 10+ years',
    'a player who retired very early due to injury or personal reasons',
    'a goalkeeper who scored in a competitive match',
    'a player whose club career eclipsed their international record',
    'a late bloomer who won their first major trophy after 30',
    'a player who won the league title with rival clubs',
    'a cult hero at a lower-league club with one famous big-match moment',
    'a player who switched position successfully mid-career',
    'a player famous for a penalty miss or save in a major final',
  ],
  HIGHER_OR_LOWER: [
    'a stat from a single knockout match or final',
    'a season total at an unexpected or lesser-known club',
    'a career record in a domestic cup competition',
    'a stat that shows a gap between club and international performance',
    'a record for a specific nationality in a foreign league',
    'a stat involving a player in the final season of their career',
    'an underappreciated secondary stat like assists or interceptions',
  ],
  GUESS_SCORE: [
    'a match where the underdog won by three or more goals',
    'a high-scoring draw with four or more goals',
    'a goalless match that had major tournament consequences',
    'a record scoreline in a domestic league',
    'a World Cup or Euros match that ended in a major shock',
    'a relegation or promotion decider on the final day',
    'a first leg result that made the second leg a formality',
    'a comeback from three goals down to draw or win',
  ],
  TOP_5: [
    'top scorers in a domestic cup competition (not the league)',
    'fastest goals ever scored in a major final',
    'most expensive transfers from a specific league in a single summer',
    'youngest players to score in a World Cup or European Championship',
    'goalkeepers with most clean sheets in a single top-flight season',
    'players with most assists in a single World Cup edition',
    'clubs with most appearances in a specific European final',
    'players with most international goals for a specific country outside top-10 FIFA',
    'managers with most league titles in a single country',
  ],
  GEOGRAPHY: [
    'a stadium named after a person rather than a location',
    'a country that hosted a major tournament for the first time',
    'a club based in a city more associated with another sport',
    'a nation that qualified for a World Cup only once in history',
    'a landlocked country that reached a major international final',
    'a city where two rival clubs share the same stadium',
    'a confederation with an unusual or surprising number of members',
    'a player born in one country but representing another at senior level',
  ],
  GOSSIP: [
    'a transfer the player publicly rejected and later regretted (or vice versa)',
    'a manager feud that became a public back-and-forth in the press',
    'a viral press conference quote that defined a career moment',
    'an off-pitch incident during an international tournament',
    'a shock announcement made on social media',
    'a contract dispute that dragged on for a full season',
    'a player banned for an unusual or surprising reason',
    'an unexpected comeback or un-retirement that surprised the football world',
  ],
} as const;

const SEASON_PHASES = [
  'on opening weekend',
  'on the final day of the season',
  'during the winter transfer window period',
  'during an international break that affected club form',
  'in the knockout stage',
  'in the group stage opener',
  'in a semifinal',
  'in the early rounds of a domestic cup',
] as const;

// ─── Global Anti-Convergence ──────────────────────────────────────────────────

/**
 * System-prompt instruction to ban the LLM's most-cached football trivia tropes.
 * Inject into every generator's system prompt.
 */
export function getAntiConvergenceInstruction(): string {
  return `
ANTI-REPETITION RULES (strictly enforced):
- NEVER ask about: Zidane's headbutt in 2006, Maradona's Hand of God, Gerrard's slip in 2014, "who won the 2022 World Cup", "who scored in the 2014 World Cup final".
- Do NOT generate questions whose answer is simply "Cristiano Ronaldo" or "Lionel Messi" without a genuinely niche, non-obvious angle.
- Avoid universally known pub-quiz questions. The question should surprise an average football fan.
- If you think of the most obvious fact first — pivot to something adjacent, lesser-known, or more specific.`;
}

// ─── Minority Scale ────────────────────────────────────────────────────────────

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Maps a target difficulty to a minority scale range.
 * Scale: 1 = extremely obscure/niche, 100 = universally famous worldwide.
 */
export function minorityScaleForDifficulty(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'EASY':   return randomInRange(70, 90);
    case 'MEDIUM': return randomInRange(45, 65);
    case 'HARD':   return randomInRange(25, 45);
  }
}

/**
 * Maps a player ELO to a minority scale. Higher ELO → more obscure entities.
 */
export function minorityScaleForElo(elo: number): number {
  if (elo < 800)  return randomInRange(75, 90);
  if (elo < 1100) return randomInRange(60, 80);
  if (elo < 1400) return randomInRange(40, 65);
  if (elo < 1800) return randomInRange(15, 40);
  return randomInRange(5, 20);
}

function entityTypeForCategory(category: string): string {
  switch (category) {
    case 'PLAYER_ID':
    case 'HIGHER_OR_LOWER': return 'player';
    case 'GOSSIP':          return 'player or manager/coach';
    case 'GUESS_SCORE':     return 'club';
    case 'GEOGRAPHY':       return 'stadium, club, or city';
    default:                return 'player or club';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[], index?: number): T {
  if (index !== undefined && index >= 0) {
    return arr[index % arr.length];
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Core Constraint Builder ──────────────────────────────────────────────────

/**
 * Builds 2–4 diversity constraints for a category.
 * 70% of the time uses minority-scale entity injection + angle (highest impact).
 * 30% of the time uses traditional dimension constraints (year + competition).
 * Always stacks at least 2 independent axes for combinatorial diversity.
 */
function pickConstraints(category: string, slotIndex?: number, minorityScale?: number): string[] {
  const constraints: string[] = [];
  const useIndex = (offset: number) =>
    slotIndex !== undefined ? (slotIndex + offset) % 100 : undefined;

  const useEntityInjection = Math.random() < 0.7;

  if (useEntityInjection) {
    const entityType = entityTypeForCategory(category);
    const scale = minorityScale ?? randomInRange(25, 85);
    const angles = QUESTION_ANGLES[category] ?? [];
    const angle = angles.length ? pick(angles as readonly string[], useIndex(1)) : null;

    // Minority scale entity constraint + chain-of-thought brainstorm instruction
    let entityConstraint = `Pick a football ${entityType} at obscurity level ${scale}/100 (where 1 = extremely obscure/niche, 100 = universally famous worldwide). The question MUST specifically involve this entity. Before writing the question, mentally recall 2 unusual or lesser-known facts about this entity, then use the most interesting one.`;
    if (angle) {
      entityConstraint += ` The specific angle MUST be: ${angle}.`;
    }
    constraints.push(entityConstraint);

    // Add one era/competition axis for extra specificity
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

  // ── Traditional dimension path (30%) — still stacks 3 axes ──
  switch (category) {
    case 'HISTORY': {
      constraints.push(`The question MUST be about events from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The topic MUST involve ${pick(COMPETITIONS, useIndex(1))}.`);
      const angles = QUESTION_ANGLES.HISTORY;
      constraints.push(`The angle MUST be: ${pick(angles, useIndex(2))}.`);
      break;
    }
    case 'PLAYER_ID': {
      constraints.push(`The player MUST be ${pick(NATIONALITIES, useIndex(0))}.`);
      constraints.push(`The player MUST be a ${pick(POSITIONS, useIndex(1))}.`);
      const angles = QUESTION_ANGLES.PLAYER_ID;
      constraints.push(`The angle MUST be: ${pick(angles, useIndex(2))}.`);
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
      const angles = QUESTION_ANGLES.HIGHER_OR_LOWER;
      constraints.push(`The angle MUST be: ${pick(angles, useIndex(2))}.`);
      break;
    }
    case 'GUESS_SCORE': {
      constraints.push(`The match MUST be from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The match MUST involve ${pick(COMPETITIONS, useIndex(1))}.`);
      const angles = QUESTION_ANGLES.GUESS_SCORE;
      constraints.push(`The angle MUST be: ${pick(angles, useIndex(2))}.`);
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
      const angles = QUESTION_ANGLES.TOP_5;
      constraints.push(`The angle MUST be: ${pick(angles, useIndex(3))}.`);
      break;
    }
    case 'GEOGRAPHY': {
      constraints.push(`The question MUST be about a ${pick(GEOGRAPHY_ENTITY_TYPES, useIndex(0))}.`);
      constraints.push(`The focus MUST be in ${pick(REGIONS, useIndex(1))}.`);
      const angles = QUESTION_ANGLES.GEOGRAPHY;
      constraints.push(`The angle MUST be: ${pick(angles, useIndex(2))}.`);
      break;
    }
    case 'GOSSIP': {
      constraints.push(`The story MUST be from ${pick(YEAR_RANGES, useIndex(0))}.`);
      constraints.push(`The topic MUST be a ${pick(GOSSIP_TOPICS, useIndex(1))}.`);
      const angles = QUESTION_ANGLES.GOSSIP;
      constraints.push(`The angle MUST be: ${pick(angles, useIndex(2))}.`);
      break;
    }
    default:
      constraints.push(`Focus on ${pick(YEAR_RANGES, useIndex(0))} or ${pick(COMPETITIONS, useIndex(1))}.`);
  }

  return constraints;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ExplicitConstraintsResult {
  promptPart: string;
  constraints: string[];
}

/**
 * Returns mandatory diversity constraints to append to the user prompt.
 * Use slotIndex when filling pool in parallel so each call gets different constraints.
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

/** Returns an "avoid" instruction if answers to avoid are provided. */
export function getAvoidInstruction(avoidAnswers: string[] | undefined): string {
  if (!avoidAnswers?.length) return '';
  const sample = avoidAnswers.slice(0, 25).join(', ');
  const suffix = avoidAnswers.length > 25 ? ` (and ${avoidAnswers.length - 25} more)` : '';
  return `\n\nDO NOT generate questions with any of these answers — pick something entirely different: ${sample}${suffix}`;
}
