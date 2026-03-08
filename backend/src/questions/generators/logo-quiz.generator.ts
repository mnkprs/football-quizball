import { Injectable, Logger } from '@nestjs/common';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeminiImageService } from '../../llm/gemini-image.service';
import { GeneratedQuestion, Difficulty } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface ClubSeed {
  name: string;
  hint: string;
  country: string;
  /** Wikipedia article title for this club — used to fetch the badge thumbnail */
  wikiTitle: string;
  /** TheSportsDB search alias as a fallback */
  searchAlias?: string;
}

const EASY_SEEDS: ClubSeed[] = [
  { name: 'Manchester United', hint: 'English club, Old Trafford',      country: 'England', wikiTitle: 'Manchester United F.C.' },
  { name: 'Real Madrid',       hint: 'Spanish club, Santiago Bernabéu', country: 'Spain',   wikiTitle: 'Real Madrid CF' },
  { name: 'Barcelona',         hint: 'Catalan club, Camp Nou',          country: 'Spain',   wikiTitle: 'FC Barcelona' },
  { name: 'Bayern Munich',     hint: 'German club, Allianz Arena',      country: 'Germany', wikiTitle: 'FC Bayern Munich' },
  { name: 'Liverpool',         hint: 'English club, Anfield',           country: 'England', wikiTitle: 'Liverpool F.C.' },
  { name: 'Chelsea',           hint: 'London club, Stamford Bridge',    country: 'England', wikiTitle: 'Chelsea F.C.' },
  { name: 'Arsenal',           hint: 'North London club, Emirates',     country: 'England', wikiTitle: 'Arsenal F.C.' },
  { name: 'Manchester City',   hint: 'English club, Etihad Stadium',    country: 'England', wikiTitle: 'Manchester City F.C.' },
];

const MEDIUM_SEEDS: ClubSeed[] = [
  { name: 'Juventus',            hint: 'Italian club, Turin',             country: 'Italy',   wikiTitle: 'Juventus F.C.' },
  { name: 'Paris Saint-Germain', hint: 'French capital club',             country: 'France',  wikiTitle: 'Paris Saint-Germain F.C.' },
  { name: 'AC Milan',            hint: 'Rossoneri, San Siro',             country: 'Italy',   wikiTitle: 'A.C. Milan' },
  { name: 'Atletico Madrid',     hint: 'Spanish club, Colchoneros',       country: 'Spain',   wikiTitle: 'Atlético de Madrid' },
  { name: 'Inter Milan',         hint: 'Nerazzurri, Milan',               country: 'Italy',   wikiTitle: 'Inter Milan' },
  { name: 'Borussia Dortmund',   hint: 'German club, Yellow Wall',        country: 'Germany', wikiTitle: 'Borussia Dortmund' },
  { name: 'Tottenham Hotspur',   hint: 'North London club, Spurs',        country: 'England', wikiTitle: 'Tottenham Hotspur F.C.' },
  { name: 'Roma',                hint: 'Italian club, Giallorossi',       country: 'Italy',   wikiTitle: 'A.S. Roma' },
];

const HARD_SEEDS: ClubSeed[] = [
  { name: 'Porto',            hint: 'Portuguese club, Estádio do Dragão',  country: 'Portugal',     wikiTitle: 'FC Porto' },
  { name: 'Ajax',             hint: 'Dutch club, Amsterdam Arena',          country: 'Netherlands',  wikiTitle: 'AFC Ajax' },
  { name: 'Benfica',          hint: 'Portuguese club, Eagles',              country: 'Portugal',     wikiTitle: 'S.L. Benfica' },
  { name: 'Napoli',           hint: 'Italian club, city of pizza',          country: 'Italy',        wikiTitle: 'S.S.C. Napoli' },
  { name: 'Sevilla',          hint: 'Spanish club, Europa League kings',    country: 'Spain',        wikiTitle: 'Sevilla FC' },
  { name: 'Bayer Leverkusen', hint: 'German club, die Werkself',            country: 'Germany',      wikiTitle: 'Bayer 04 Leverkusen' },
  { name: 'Valencia',         hint: 'Spanish club, Los Ches, Mestalla',     country: 'Spain',        wikiTitle: 'Valencia CF' },
  { name: 'Celtic',           hint: 'Scottish club, Parkhead',              country: 'Scotland',     wikiTitle: 'Celtic F.C.' },
  { name: 'Rangers',          hint: 'Scottish club, Ibrox',                 country: 'Scotland',     wikiTitle: 'Rangers FC' },
  { name: 'Lazio',            hint: 'Italian club, Biancocelesti',          country: 'Italy',        wikiTitle: 'S.S. Lazio' },
];

@Injectable()
export class LogoQuizGenerator {
  private readonly logger = new Logger(LogoQuizGenerator.name);

  constructor(
    private footballApiService: FootballApiService,
    private geminiImageService: GeminiImageService,
  ) {}

  async generate(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    // Stagger concurrent calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, Math.random() * 400));

    const pool = this.getPool(difficulty);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    for (const seed of shuffled) {
      const rawUrl = await this.resolveBadgeUrl(seed);
      if (!rawUrl) continue;

      const transformedUrl = await this.geminiImageService.transformLogoImage(rawUrl);
      if (!transformedUrl) {
        this.logger.warn(`Image transform failed for ${seed.name}, trying next`);
        continue;
      }

      return this.buildQuestion(seed, rawUrl, transformedUrl, difficulty, points);
    }

    // All seeds failed — text-only fallback so the question is still playable
    this.logger.warn(`All logo seeds failed for difficulty=${difficulty}, using text fallback`);
    const fallback = shuffled[0];
    return {
      id: uuidv4(),
      category: 'LOGO_QUIZ',
      difficulty,
      points,
      question_text: `Which club plays at: ${fallback.hint}?`,
      correct_answer: fallback.name,
      fifty_fifty_hint: `Club from ${fallback.country}`,
      fifty_fifty_applicable: true,
      explanation: `The answer is ${fallback.name} (${fallback.country}).`,
      image_url: null,
      meta: { country: fallback.country },
    };
  }

  private getPool(difficulty: Difficulty): ClubSeed[] {
    switch (difficulty) {
      case 'EASY':   return EASY_SEEDS;
      case 'MEDIUM': return [...MEDIUM_SEEDS, ...EASY_SEEDS.slice(0, 2)];
      case 'HARD':   return [...HARD_SEEDS, ...MEDIUM_SEEDS.slice(0, 2)];
    }
  }

  /**
   * Try Wikipedia first (most reliable), then TheSportsDB search as fallback.
   */
  private async resolveBadgeUrl(seed: ClubSeed): Promise<string | null> {
    // 1. Wikipedia REST API — stable thumbnails, always up to date
    const wikiUrl = await this.footballApiService.getWikipediaBadge(seed.wikiTitle);
    if (wikiUrl) return wikiUrl;

    // 2. TheSportsDB search — free tier returns strTeamBadge for most clubs
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

  private buildQuestion(seed: ClubSeed, rawUrl: string, transformedUrl: string, difficulty: Difficulty, points: number): GeneratedQuestion {
    return {
      id: uuidv4(),
      category: 'LOGO_QUIZ',
      difficulty,
      points,
      question_text: 'Which football club does this badge belong to?',
      correct_answer: seed.name,
      fifty_fifty_hint: seed.hint,
      fifty_fifty_applicable: true,
      explanation: `This is the badge of ${seed.name}, a club from ${seed.country}.`,
      image_url: transformedUrl,
      meta: { country: seed.country, original_image_url: rawUrl },
    };
  }
}
