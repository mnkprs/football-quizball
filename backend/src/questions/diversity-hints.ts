/**
 * Random diversity hints to inject into LLM prompts.
 * Each call returns different constraints so the model produces varied questions
 * instead of converging on similar outputs when given identical prompts.
 */

const ERAS = [
  'Focus on pre-1980 football.',
  'Focus on the 1980s or 1990s.',
  'Focus on the 2000s.',
  'Focus on 2010s onwards.',
  'Focus on the 2020s.',
  'Pick from a mix of eras — avoid the most obvious recent examples.',
];

const LEAGUES = [
  'Prefer Premier League or English football.',
  'Prefer La Liga or Spanish football.',
  'Prefer Bundesliga or German football.',
  'Prefer Serie A or Italian football.',
  'Prefer international tournaments (World Cup, Euros, Copa América).',
  'Prefer Latin American club football (Brasileirão, Argentine league, etc.).',
  'Prefer lesser-known European leagues (Eredivisie, Primeira Liga, Turkish Süper Lig).',
  'Prefer African or Asian football.',
];

const TOPICS_HISTORY = [
  'Pick a famous final or trophy moment.',
  'Pick an obscure but factual match or record.',
  'Pick a club rivalry or derby.',
  'Pick a national team milestone.',
  'Pick a managerial or tactical milestone.',
  'Pick a transfer or signing that changed history.',
];

const TOPICS_PLAYER = [
  'Pick a legendary retired player.',
  'Pick a current star from a top league.',
  'Pick a cult hero or lesser-known international.',
  'Pick a player from outside the top 5 European leagues.',
  'Pick a goalkeeper or defender (not just forwards).',
];

const TOPICS_GEOGRAPHY = [
  'Pick a country or national team.',
  'Pick a city and its clubs.',
  'Pick a stadium or venue.',
  'Pick a confederation or regional football.',
];

const TOPICS_GOSSIP = [
  'Pick a transfer saga.',
  'Pick a controversy or incident.',
  'Pick a celebrity or lifestyle story.',
  'Pick a feud or rivalry off the pitch.',
];

const STAT_TYPES = [
  'Pick a goalscoring stat.',
  'Pick an assists or creative stat.',
  'Pick a defensive or clean-sheet stat.',
  'Pick a transfer fee or contract stat.',
  'Pick a caps or appearances stat.',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CATEGORY_TOPICS: Record<string, readonly string[]> = {
  HISTORY: TOPICS_HISTORY,
  PLAYER_ID: TOPICS_PLAYER,
  GEOGRAPHY: TOPICS_GEOGRAPHY,
  GOSSIP: TOPICS_GOSSIP,
  HIGHER_OR_LOWER: STAT_TYPES,
  GUESS_SCORE: STAT_TYPES,
  TOP_5: STAT_TYPES,
};

/** Returns 1–2 random diversity hints to append to the user prompt. */
export function getDiversityHints(category: string): string {
  const eraOrLeague = Math.random() < 0.5 ? pick(ERAS) : pick(LEAGUES);
  const topicArr = CATEGORY_TOPICS[category];
  const topicHint = topicArr ? pick(topicArr) : null;
  const top5Extra = category === 'TOP_5' ? 'Avoid the most common "top 5" lists — pick a more niche ranking.' : null;

  const hints = [eraOrLeague, topicHint, top5Extra].filter(Boolean);
  if (hints.length === 0) return '';
  return `\n\nDiversity constraint: ${hints.join(' ')}`;
}

/** Returns an "avoid" instruction if answers to avoid are provided. */
export function getAvoidInstruction(avoidAnswers: string[] | undefined): string {
  if (!avoidAnswers?.length) return '';
  const sample = avoidAnswers.slice(0, 12).join(', ');
  const suffix = avoidAnswers.length > 12 ? ` (and ${avoidAnswers.length - 12} more)` : '';
  return `\n\nIMPORTANT: Do NOT generate questions with these answers — pick something different: ${sample}${suffix}`;
}
