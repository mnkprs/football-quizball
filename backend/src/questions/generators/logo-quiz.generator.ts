import { Injectable, Logger } from '@nestjs/common';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeminiImageService } from '../../llm/gemini-image.service';
import { GeneratedQuestion, Difficulty } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface ClubLogoSeed {
  name: string;
  hint: string;
  country: string;
}

// Seed club names – badge URLs are always fetched fresh from TheSportsDB
const LOGO_SEED_BANK: ClubLogoSeed[] = [
  { name: 'Manchester United', hint: 'English club, Old Trafford', country: 'England' },
  { name: 'Real Madrid', hint: 'Spanish club, Santiago Bernabéu', country: 'Spain' },
  { name: 'Barcelona', hint: 'Catalan club, Camp Nou', country: 'Spain' },
  { name: 'Bayern Munich', hint: 'German club, Allianz Arena', country: 'Germany' },
  { name: 'Liverpool', hint: 'English club, Anfield', country: 'England' },
  { name: 'Chelsea', hint: 'London club, Stamford Bridge', country: 'England' },
  { name: 'Arsenal', hint: 'North London club', country: 'England' },
  { name: 'Juventus', hint: 'Italian club, Turin', country: 'Italy' },
  { name: 'Paris Saint-Germain', hint: 'French capital club', country: 'France' },
  { name: 'AC Milan', hint: 'Rossoneri, San Siro', country: 'Italy' },
  { name: 'Atletico Madrid', hint: 'Spanish club, Colchoneros', country: 'Spain' },
  { name: 'Manchester City', hint: 'English club, Etihad Stadium', country: 'England' },
  { name: 'Inter Milan', hint: 'Nerazzurri, Milan', country: 'Italy' },
  { name: 'Borussia Dortmund', hint: 'German club, Yellow Wall', country: 'Germany' },
  { name: 'Tottenham Hotspur', hint: 'North London club, Spurs', country: 'England' },
];

const HARD_LOGO_SEEDS: ClubLogoSeed[] = [
  { name: 'Porto', hint: 'Portuguese club, Estádio do Dragão', country: 'Portugal' },
  { name: 'Ajax', hint: 'Dutch club, Amsterdam', country: 'Netherlands' },
  { name: 'Benfica', hint: 'Portuguese club, Eagles', country: 'Portugal' },
  { name: 'Napoli', hint: 'Italian club, city of pizza', country: 'Italy' },
  { name: 'Sevilla', hint: 'Spanish club, Europa League kings', country: 'Spain' },
];

@Injectable()
export class LogoQuizGenerator {
  private readonly logger = new Logger(LogoQuizGenerator.name);

  constructor(
    private footballApiService: FootballApiService,
    private geminiImageService: GeminiImageService,
  ) {}

  async generate(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    try {
      return await this.generateFromApi(difficulty, points);
    } catch (err) {
      this.logger.warn(`Logo quiz API generation failed, using seed: ${(err as Error).message}`);
      return this.generateFromSeed(difficulty, points);
    }
  }

  private async generateFromApi(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    const teams = await this.footballApiService.getPopularTeams();
    if (!teams || teams.length === 0) throw new Error('No teams from API');

    const teamsWithLogos = teams.filter((t: any) => t.strTeamBadge);
    if (teamsWithLogos.length === 0) throw new Error('No teams with logos');

    const randomTeam = teamsWithLogos[Math.floor(Math.random() * teamsWithLogos.length)];
    const logoUrl: string = randomTeam.strTeamBadge;

    const isValid = await this.footballApiService.verifyImageUrl(logoUrl);
    if (!isValid) throw new Error(`Logo URL does not resolve: ${logoUrl}`);

    const transformedUrl = await this.geminiImageService.transformLogoImage(logoUrl);
    const hint = `${randomTeam.strCountry || 'Unknown'} club`;

    return {
      id: uuidv4(),
      category: 'LOGO_QUIZ',
      difficulty,
      points,
      question_text: 'Which football club does this badge belong to?',
      correct_answer: randomTeam.strTeam,
      fifty_fifty_hint: hint,
      fifty_fifty_applicable: true,
      explanation: `This is the badge of ${randomTeam.strTeam}, based in ${randomTeam.strCountry || 'unknown country'}.`,
      image_url: transformedUrl,
      meta: { team_id: randomTeam.idTeam, country: randomTeam.strCountry },
    };
  }

  private async generateFromSeed(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    const pool = difficulty === 'HARD' ? HARD_LOGO_SEEDS :
                 difficulty === 'MEDIUM' ? [...LOGO_SEED_BANK.slice(5), ...HARD_LOGO_SEEDS] :
                 LOGO_SEED_BANK.slice(0, 5);

    const seed = pool[Math.floor(Math.random() * pool.length)];

    // Always fetch fresh badge URL from TheSportsDB instead of using stale hardcoded ones
    let logoUrl: string | null = null;
    try {
      const result = await this.footballApiService.getTeamByName(seed.name);
      const team = result?.teams?.[0];
      if (team?.strTeamBadge) {
        const valid = await this.footballApiService.verifyImageUrl(team.strTeamBadge);
        if (valid) logoUrl = team.strTeamBadge;
      }
    } catch (err) {
      this.logger.warn(`Could not fetch fresh badge for ${seed.name}: ${(err as Error).message}`);
    }

    if (!logoUrl) {
      throw new Error(`No valid badge URL found for seed team: ${seed.name}`);
    }

    const transformedUrl = await this.geminiImageService.transformLogoImage(logoUrl);

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
      meta: { country: seed.country },
    };
  }
}
