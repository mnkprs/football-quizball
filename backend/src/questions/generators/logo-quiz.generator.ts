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
  wikiTitle: string;
  /**
   * 1–10 recognisability score (10 = universally iconic logo, 1 = very obscure).
   * Drives the DifficultyScorer: high fame → EASY, low fame → HARD.
   */
  fame_score: number;
}

const CLUB_POOL: ClubSeed[] = [
  // ── EASY tier (fame 9–10, instantly recognisable worldwide) ──────────────────
  { name: 'Manchester United', hint: 'English club, Old Trafford',          country: 'England',     league: 'Premier League', wikiTitle: 'Manchester United F.C.',       fame_score: 10 },
  { name: 'Real Madrid',       hint: 'Spanish club, Santiago Bernabéu',     country: 'Spain',       league: 'La Liga',        wikiTitle: 'Real Madrid CF',               fame_score: 10 },
  { name: 'Barcelona',         hint: 'Catalan club, Camp Nou',              country: 'Spain',       league: 'La Liga',        wikiTitle: 'FC Barcelona',                 fame_score: 10 },
  { name: 'Bayern Munich',     hint: 'German club, Allianz Arena',          country: 'Germany',     league: 'Bundesliga',     wikiTitle: 'FC Bayern Munich',             fame_score: 10 },
  { name: 'Liverpool',         hint: 'English club, Anfield',               country: 'England',     league: 'Premier League', wikiTitle: 'Liverpool F.C.',               fame_score: 10 },
  { name: 'Chelsea',           hint: 'London club, Stamford Bridge',        country: 'England',     league: 'Premier League', wikiTitle: 'Chelsea F.C.',                 fame_score: 9  },
  { name: 'Arsenal',           hint: 'North London club, Emirates',         country: 'England',     league: 'Premier League', wikiTitle: 'Arsenal F.C.',                 fame_score: 9  },
  { name: 'Manchester City',   hint: 'English club, Etihad Stadium',        country: 'England',     league: 'Premier League', wikiTitle: 'Manchester City F.C.',         fame_score: 9  },

  // ── MEDIUM tier (fame 6–8, known to regular football fans) ───────────────────
  { name: 'Juventus',          hint: 'Italian club, Turin',                 country: 'Italy',       league: 'Serie A',        wikiTitle: 'Juventus F.C.',                fame_score: 8  },
  { name: 'Paris Saint-Germain', hint: 'French capital club',               country: 'France',      league: 'Ligue 1',        wikiTitle: 'Paris Saint-Germain F.C.',     fame_score: 8  },
  { name: 'AC Milan',          hint: 'Rossoneri, San Siro',                 country: 'Italy',       league: 'Serie A',        wikiTitle: 'A.C. Milan',                   fame_score: 8  },
  { name: 'Inter Milan',       hint: 'Nerazzurri, Milan',                   country: 'Italy',       league: 'Serie A',        wikiTitle: 'Inter Milan',                  fame_score: 7  },
  { name: 'Atletico Madrid',   hint: 'Spanish club, Colchoneros',           country: 'Spain',       league: 'La Liga',        wikiTitle: 'Atlético de Madrid',           fame_score: 7  },
  { name: 'Borussia Dortmund', hint: 'German club, Yellow Wall',            country: 'Germany',     league: 'Bundesliga',     wikiTitle: 'Borussia Dortmund',            fame_score: 7  },
  { name: 'Tottenham Hotspur', hint: 'North London club, Spurs',            country: 'England',     league: 'Premier League', wikiTitle: 'Tottenham Hotspur F.C.',       fame_score: 7  },
  { name: 'Roma',              hint: 'Italian club, Giallorossi',           country: 'Italy',       league: 'Serie A',        wikiTitle: 'A.S. Roma',                    fame_score: 6  },
  { name: 'Ajax',              hint: 'Dutch club, Amsterdam Arena',         country: 'Netherlands', league: 'Eredivisie',     wikiTitle: 'AFC Ajax',                     fame_score: 6  },
  { name: 'Benfica',           hint: 'Portuguese club, Eagles',             country: 'Portugal',    league: 'Primeira Liga',  wikiTitle: 'S.L. Benfica',                 fame_score: 6  },

  // ── HARD tier (fame 1–5, recognised mainly by dedicated fans) ────────────────
  { name: 'Napoli',            hint: 'Italian club, city of pizza',         country: 'Italy',       league: 'Serie A',        wikiTitle: 'S.S.C. Napoli',                fame_score: 5  },
  { name: 'Sevilla',           hint: 'Spanish club, Europa League kings',   country: 'Spain',       league: 'La Liga',        wikiTitle: 'Sevilla FC',                   fame_score: 5  },
  { name: 'Porto',             hint: 'Portuguese club, Estádio do Dragão',  country: 'Portugal',    league: 'Primeira Liga',  wikiTitle: 'FC Porto',                     fame_score: 5  },
  { name: 'Bayer Leverkusen',  hint: 'German club, die Werkself',           country: 'Germany',     league: 'Bundesliga',     wikiTitle: 'Bayer 04 Leverkusen',          fame_score: 4  },
  { name: 'Valencia',          hint: 'Spanish club, Los Ches, Mestalla',    country: 'Spain',       league: 'La Liga',        wikiTitle: 'Valencia CF',                  fame_score: 4  },
  { name: 'Lazio',             hint: 'Italian club, Biancocelesti',         country: 'Italy',       league: 'Serie A',        wikiTitle: 'S.S. Lazio',                   fame_score: 4  },
  { name: 'Celtic',            hint: 'Scottish club, Celtic Park',          country: 'Scotland',    league: 'Scottish Premiership', wikiTitle: 'Celtic F.C.',            fame_score: 3  },
  { name: 'Rangers',           hint: 'Scottish club, Ibrox',                country: 'Scotland',    league: 'Scottish Premiership', wikiTitle: 'Rangers FC',             fame_score: 3  },
];

@Injectable()
export class LogoQuizGenerator {
  private readonly logger = new Logger(LogoQuizGenerator.name);

  constructor(
    private footballApiService: FootballApiService,
    private geminiImageService: GeminiImageService,
  ) {}

  async generate(): Promise<GeneratedQuestion> {
    // Stagger concurrent calls slightly to avoid rate limiting
    await new Promise((r) => setTimeout(r, Math.random() * 300));

    const shuffled = [...CLUB_POOL].sort(() => Math.random() - 0.5);

    for (const seed of shuffled) {
      const rawUrl = await this.resolveBadgeUrl(seed);
      if (!rawUrl) continue;

      const transformedUrl = await this.geminiImageService.transformLogoImage(rawUrl);
      if (!transformedUrl) {
        this.logger.warn(`Gemini transform failed for ${seed.name}, trying next club`);
        continue;
      }

      return this.buildQuestion(seed, rawUrl, transformedUrl);
    }

    // All seeds failed (Gemini unavailable) — generate a text-only fallback
    this.logger.warn('All logo quiz seeds failed — using text fallback');
    const fallback = shuffled[0];
    return {
      id: uuidv4(),
      category: 'LOGO_QUIZ',
      difficulty: 'EASY',
      points: 1,
      question_text: `Which club plays at: ${fallback.hint}?`,
      correct_answer: fallback.name,
      fifty_fifty_hint: `Club from ${fallback.country}`,
      fifty_fifty_applicable: true,
      explanation: `The answer is ${fallback.name} (${fallback.country}).`,
      image_url: null,
      meta: { country: fallback.country },
      difficulty_factors: this.difficultyFactors(fallback),
    };
  }

  /**
   * Try Wikipedia first (most stable source), then TheSportsDB as fallback.
   */
  private async resolveBadgeUrl(seed: ClubSeed): Promise<string | null> {
    const wikiUrl = await this.footballApiService.getWikipediaBadge(seed.wikiTitle);
    if (wikiUrl) return wikiUrl;

    try {
      const result = await this.footballApiService.getTeamByName(seed.name);
      const teams: any[] = result?.teams ?? [];
      const team = teams.find((t: any) => t.strTeamBadge);
      if (team?.strTeamBadge) {
        const url: string = team.strTeamBadge;
        return url.startsWith('http') ? url : `https:${url}`;
      }
    } catch (err) {
      this.logger.warn(`TheSportsDB lookup failed for ${seed.name}: ${(err as Error).message}`);
    }

    return null;
  }

  private buildQuestion(
    seed: ClubSeed,
    rawUrl: string,
    transformedUrl: string,
  ): GeneratedQuestion {
    return {
      id: uuidv4(),
      category: 'LOGO_QUIZ',
      difficulty: 'EASY', // overridden by DifficultyScorer during board assembly
      points: 1,
      question_text: 'Which football club does this badge belong to?',
      correct_answer: seed.name,
      fifty_fifty_hint: seed.hint,
      fifty_fifty_applicable: true,
      explanation: `This is the badge of ${seed.name}, a club from ${seed.country}.`,
      image_url: transformedUrl,
      meta: { country: seed.country, original_image_url: rawUrl },
      difficulty_factors: this.difficultyFactors(seed),
    };
  }

  private difficultyFactors(seed: ClubSeed): DifficultyFactors {
    return {
      event_year: new Date().getFullYear(), // not event-based; dateScore → 0
      competition: seed.league,
      fame_score: seed.fame_score,
    };
  }
}
