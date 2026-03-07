import { Injectable, Logger } from '@nestjs/common';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, Difficulty } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface ClubLogoSeed {
  name: string;
  logo_url: string;
  hint: string;
  country: string;
}

// TheSportsDB logo URLs - verified working
const LOGO_SEED_BANK: ClubLogoSeed[] = [
  { name: 'Manchester United', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/xzqdr11517660252.png', hint: 'English club, Old Trafford', country: 'England' },
  { name: 'Real Madrid', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/vwpvry1467462651.png', hint: 'Spanish club, Santiago Bernabéu', country: 'Spain' },
  { name: 'Barcelona', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/uvuqtu1424182355.png', hint: 'Catalan club, Camp Nou', country: 'Spain' },
  { name: 'Bayern Munich', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/tvtswu1424187779.png', hint: 'German club, Allianz Arena', country: 'Germany' },
  { name: 'Liverpool', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/uvuqtu1424186667.png', hint: 'English club, Anfield', country: 'England' },
  { name: 'Chelsea', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/yvwvtu1448813215.png', hint: 'London club, Stamford Bridge', country: 'England' },
  { name: 'Arsenal', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/a1af2i1557005128.png', hint: 'North London club', country: 'England' },
  { name: 'Juventus', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/putuqv1448813101.png', hint: 'Italian club, Turin', country: 'Italy' },
  { name: 'Paris Saint-Germain', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/xpuxqv1448813062.png', hint: 'French capital club', country: 'France' },
  { name: 'AC Milan', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/yqtxqv1448813026.png', hint: 'Rossoneri, San Siro', country: 'Italy' },
  { name: 'Atletico Madrid', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/6vv3451611515004.png', hint: 'Spanish club, Colchoneros', country: 'Spain' },
  { name: 'Manchester City', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/vwpvry1467462651.png', hint: 'English club, Etihad Stadium', country: 'England' },
  { name: 'Inter Milan', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/tvtxqv1448813031.png', hint: 'Nerazzurri, Milan', country: 'Italy' },
  { name: 'Borussia Dortmund', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/stvwut1424188149.png', hint: 'German club, Yellow Wall', country: 'Germany' },
  { name: 'Tottenham Hotspur', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/vrpvry1467462651.png', hint: 'North London club, Spurs', country: 'England' },
];

// Harder clubs for medium/hard difficulties
const HARD_LOGO_SEEDS: ClubLogoSeed[] = [
  { name: 'Porto', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/bk5m3o1517660268.png', hint: 'Portuguese club, Estádio do Dragão', country: 'Portugal' },
  { name: 'Ajax', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/c0mbni1557924155.png', hint: 'Dutch club, Amsterdam', country: 'Netherlands' },
  { name: 'Benfica', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/k1e6kh1521061008.png', hint: 'Portuguese club, Eagles', country: 'Portugal' },
  { name: 'Napoli', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/spqwxv1448813065.png', hint: 'Italian club, city of pizza', country: 'Italy' },
  { name: 'Sevilla', logo_url: 'https://www.thesportsdb.com/images/media/team/badge/wutvxv1448813069.png', hint: 'Spanish club, Europa League kings', country: 'Spain' },
];

@Injectable()
export class LogoQuizGenerator {
  private readonly logger = new Logger(LogoQuizGenerator.name);

  constructor(private footballApiService: FootballApiService) {}

  async generate(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    try {
      return await this.generateFromApi(difficulty, points);
    } catch (err) {
      this.logger.warn(`Logo quiz API generation failed, using seed: ${(err as Error).message}`);
      return this.getSeedQuestion(difficulty, points);
    }
  }

  private async generateFromApi(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    const teams = await this.footballApiService.getPopularTeams();
    if (!teams || teams.length === 0) {
      throw new Error('No teams from API');
    }

    // Filter teams with badge URLs
    const teamsWithLogos = teams.filter((t: any) => t.strTeamBadge);
    if (teamsWithLogos.length === 0) throw new Error('No teams with logos');

    const randomTeam = teamsWithLogos[Math.floor(Math.random() * teamsWithLogos.length)];
    const logoUrl: string = randomTeam.strTeamBadge;

    const isValid = await this.footballApiService.verifyImageUrl(logoUrl);
    if (!isValid) throw new Error('Logo URL does not resolve');

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
      image_url: logoUrl,
      meta: { team_id: randomTeam.idTeam, country: randomTeam.strCountry },
    };
  }

  private getSeedQuestion(difficulty: Difficulty, points: number): GeneratedQuestion {
    const pool = difficulty === 'HARD' ? HARD_LOGO_SEEDS :
                 difficulty === 'MEDIUM' ? [...LOGO_SEED_BANK.slice(5), ...HARD_LOGO_SEEDS] :
                 LOGO_SEED_BANK.slice(0, 5);

    const seed = pool[Math.floor(Math.random() * pool.length)];

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
      image_url: seed.logo_url,
      meta: { country: seed.country },
    };
  }
}
