import { Injectable, Logger } from '@nestjs/common';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeminiImageService } from '../../llm/gemini-image.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface ClubSeed {
  name: string;
  hint: string;
  country: string;
  league: string;
  /** Wikipedia article title for this club — used to fetch the badge thumbnail */
  wikiTitle: string;
  /** TheSportsDB search alias as a fallback */
  searchAlias?: string;
}

const CLUB_POOL: ClubSeed[] = [
  // Tier 1 leagues
  { name: 'Manchester United',   hint: 'English club, Old Trafford',          country: 'England',     league: 'Premier League',      wikiTitle: 'Manchester United F.C.' },
  { name: 'Real Madrid',         hint: 'Spanish club, Santiago Bernabéu',     country: 'Spain',       league: 'La Liga',             wikiTitle: 'Real Madrid CF' },
  { name: 'Barcelona',           hint: 'Catalan club, Camp Nou',              country: 'Spain',       league: 'La Liga',             wikiTitle: 'FC Barcelona' },
  { name: 'Bayern Munich',       hint: 'German club, Allianz Arena',          country: 'Germany',     league: 'Bundesliga',          wikiTitle: 'FC Bayern Munich' },
  { name: 'Liverpool',           hint: 'English club, Anfield',               country: 'England',     league: 'Premier League',      wikiTitle: 'Liverpool F.C.' },
  { name: 'Chelsea',             hint: 'London club, Stamford Bridge',        country: 'England',     league: 'Premier League',      wikiTitle: 'Chelsea F.C.' },
  { name: 'Arsenal',             hint: 'North London club, Emirates',         country: 'England',     league: 'Premier League',      wikiTitle: 'Arsenal F.C.' },
  { name: 'Manchester City',     hint: 'English club, Etihad Stadium',        country: 'England',     league: 'Premier League',      wikiTitle: 'Manchester City F.C.' },
  { name: 'Juventus',            hint: 'Italian club, Turin',                 country: 'Italy',       league: 'Serie A',             wikiTitle: 'Juventus F.C.' },
  { name: 'AC Milan',            hint: 'Rossoneri, San Siro',                 country: 'Italy',       league: 'Serie A',             wikiTitle: 'A.C. Milan' },
  { name: 'Inter Milan',         hint: 'Nerazzurri, Milan',                   country: 'Italy',       league: 'Serie A',             wikiTitle: 'Inter Milan' },
  { name: 'Atletico Madrid',     hint: 'Spanish club, Colchoneros',           country: 'Spain',       league: 'La Liga',             wikiTitle: 'Atlético de Madrid' },
  { name: 'Borussia Dortmund',   hint: 'German club, Yellow Wall',            country: 'Germany',     league: 'Bundesliga',          wikiTitle: 'Borussia Dortmund' },
  { name: 'Tottenham Hotspur',   hint: 'North London club, Spurs',            country: 'England',     league: 'Premier League',      wikiTitle: 'Tottenham Hotspur F.C.' },
  { name: 'Roma',                hint: 'Italian club, Giallorossi',           country: 'Italy',       league: 'Serie A',             wikiTitle: 'A.S. Roma' },
  { name: 'Napoli',              hint: 'Italian club, city of pizza',         country: 'Italy',       league: 'Serie A',             wikiTitle: 'S.S.C. Napoli' },
  { name: 'Sevilla',             hint: 'Spanish club, Europa League kings',   country: 'Spain',       league: 'La Liga',             wikiTitle: 'Sevilla FC' },
  { name: 'Bayer Leverkusen',    hint: 'German club, die Werkself',           country: 'Germany',     league: 'Bundesliga',          wikiTitle: 'Bayer 04 Leverkusen' },
  { name: 'Valencia',            hint: 'Spanish club, Los Ches, Mestalla',    country: 'Spain',       league: 'La Liga',             wikiTitle: 'Valencia CF' },
  { name: 'Lazio',               hint: 'Italian club, Biancocelesti',         country: 'Italy',       league: 'Serie A',             wikiTitle: 'S.S. Lazio' },
  // Tier 2 leagues
  { name: 'Paris Saint-Germain', hint: 'French capital club',                 country: 'France',      league: 'Ligue 1',             wikiTitle: 'Paris Saint-Germain F.C.' },
  { name: 'Porto',               hint: 'Portuguese club, Estádio do Dragão',  country: 'Portugal',    league: 'Primeira Liga',       wikiTitle: 'FC Porto' },
  { name: 'Ajax',                hint: 'Dutch club, Amsterdam Arena',         country: 'Netherlands', league: 'Eredivisie',          wikiTitle: 'AFC Ajax' },
  { name: 'Benfica',             hint: 'Portuguese club, Eagles',             country: 'Portugal',    league: 'Primeira Liga',       wikiTitle: 'S.L. Benfica' },
  // Tier 3 leagues
  { name: 'Celtic',              hint: 'Scottish club, Parkhead',             country: 'Scotland',    league: 'Scottish Premiership', wikiTitle: 'Celtic F.C.' },
  { name: 'Rangers',             hint: 'Scottish club, Ibrox',                country: 'Scotland',    league: 'Scottish Premiership', wikiTitle: 'Rangers FC' },
];

@Injectable()
export class LogoQuizGenerator {
  private readonly logger = new Logger(LogoQuizGenerator.name);

  constructor(
    private footballApiService: FootballApiService,
    private geminiImageService: GeminiImageService,
  ) {}

  async generate(): Promise<GeneratedQuestion> {
    // Stagger concurrent calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, Math.random() * 400));

    const shuffled = [...CLUB_POOL].sort(() => Math.random() - 0.5);

    for (const seed of shuffled) {
      const rawUrl = await this.resolveBadgeUrl(seed);
      if (!rawUrl) continue;

      const transformedUrl = await this.geminiImageService.transformLogoImage(rawUrl);
      if (!transformedUrl) {
        this.logger.warn(`Image transform failed for ${seed.name}, trying next`);
        continue;
      }

      return this.buildQuestion(seed, transformedUrl);
    }

    // All seeds failed — text-only fallback so the question is still playable
    this.logger.warn(`All logo seeds failed, using text fallback`);
    const fallback = shuffled[0];
    return this.buildTextFallback(fallback);
  }

  private buildDifficultyFactors(seed: ClubSeed): DifficultyFactors {
    return {
      event_year: new Date().getFullYear(),
      competition: seed.league,
      fame_score: null, // use familiarity_score as proxy per plan
    };
  }

  /**
   * Try Wikipedia first (most reliable), then TheSportsDB search as fallback.
   */
  private async resolveBadgeUrl(seed: ClubSeed): Promise<string | null> {
    const wikiUrl = await this.footballApiService.getWikipediaBadge(seed.wikiTitle);
    if (wikiUrl) return wikiUrl;

    const searchName = seed.searchAlias ?? seed.name;
    try {
      const result = await this.footballApiService.getTeamByName(searchName);
      const teams: any[] = result?.teams ?? [];
      const team = teams.find((t: any) => t.strTeamBadge);
      if (team?.strTeamBadge) {
        const url: string = team.strTeamBadge;
        return url.startsWith('http') ? url : `https:${url}`;
      }
    } catch (err) {
      this.logger.warn(`TheSportsDB badge lookup failed for ${searchName}: ${(err as Error).message}`);
    }

    return null;
  }

  private buildQuestion(seed: ClubSeed, imageUrl: string): GeneratedQuestion {
    return {
      id: uuidv4(),
      category: 'LOGO_QUIZ',
      difficulty: 'EASY',
      points: 1,
      question_text: 'Which football club does this badge belong to?',
      correct_answer: seed.name,
      fifty_fifty_hint: seed.hint,
      fifty_fifty_applicable: true,
      explanation: `This is the badge of ${seed.name}, a club from ${seed.country}.`,
      image_url: imageUrl,
      meta: { country: seed.country },
      difficulty_factors: this.buildDifficultyFactors(seed),
    };
  }

  private buildTextFallback(seed: ClubSeed): GeneratedQuestion {
    return {
      id: uuidv4(),
      category: 'LOGO_QUIZ',
      difficulty: 'EASY',
      points: 1,
      question_text: `Which club plays at: ${seed.hint}?`,
      correct_answer: seed.name,
      fifty_fifty_hint: `Club from ${seed.country}`,
      fifty_fifty_applicable: true,
      explanation: `The answer is ${seed.name} (${seed.country}).`,
      image_url: null,
      meta: { country: seed.country },
      difficulty_factors: this.buildDifficultyFactors(seed),
    };
  }
}
