import type { QuestionCategory } from '../../common/interfaces/question.interface';

/**
 * Year ranges for diversity constraints (era-based question variety).
 */
export const YEAR_RANGES = [
  'pre-1960', '1960s', '1970s',
  '1980', '1981', '1982', '1983', '1984', '1985', '1986', '1987', '1988', '1989',
  '1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999',
  '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009',
  '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
  '2020', '2021', '2022', '2023', '2024', '2025',
] as const;

export const NATIONALITIES = [
  'Brazilian', 'Argentine', 'French', 'German', 'Spanish', 'Italian',
  'African (any nation)', 'Asian (any nation)', 'Eastern European',
  'Scandinavian', 'Dutch or Belgian', 'Portuguese', 'Greek',
  'Croatian or Serbian', 'Mexican or Central American',
  'Colombian or Venezuelan', 'Uruguayan or Paraguayan',
  'Scottish or Irish', 'Turkish', 'Polish or Czech',
] as const;

export const COMPETITIONS = [
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

export const POSITIONS = [
  'goalkeeper', 'right-back', 'left-back', 'centre-back',
  'defensive midfielder', 'central midfielder', 'attacking midfielder',
  'right winger', 'left winger', 'striker', 'second striker',
] as const;

export const STAT_TYPES = [
  'goals scored', 'assists', 'international caps', 'clean sheets',
  'transfer fee paid', 'trophies won', 'yellow or red cards received',
  'hat-tricks', 'winning goals', 'penalty kicks scored or missed',
  'clean sheet streak', 'consecutive league appearances',
  'minutes played in a single tournament', 'saves made in a season',
] as const;

export const REGIONS = ['Europe', 'South America', 'Africa', 'Asia', 'North & Central America'] as const;

export const GEOGRAPHY_ENTITY_TYPES = [
  'city famous for football rivalry between two clubs',
  'historically significant stadium or venue',
  'nationality of a famous player (where they were born or represent)',
  'confederation or regional football body',
  'host nation of a major tournament',
  'country where a specific club is located',
  'stadium capacity or location fact',
  'nation that qualified for a World Cup or Euros',
] as const;

/** Question phrasings to force variety — avoid always "which country hosted...". */
export const GEOGRAPHY_QUESTION_PATTERNS = [
  'Which city...',
  'In which country is...',
  'Which stadium...',
  'Which nationality...',
  'Which nation...',
  'Where is... located',
  'Which confederation...',
  'Which club is based in...',
] as const;

export const GOSSIP_TOPICS = [
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

export const SEASON_PHASES = [
  'on opening weekend',
  'on the final day of the season',
  'during the winter transfer window period',
  'during an international break that affected club form',
  'in the knockout stage',
  'in the group stage opener',
  'in a semifinal',
  'in the early rounds of a domestic cup',
] as const;

/**
 * Question angles per category — what makes a question interesting.
 */
export const QUESTION_ANGLES: Record<string, readonly string[]> = {
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
