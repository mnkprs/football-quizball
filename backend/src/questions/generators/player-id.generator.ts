import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface CareerEntry {
  club: string;
  from: string;
  to: string;
}

interface SeedEntry {
  player_name: string;
  career: CareerEntry[];
  nationality: string;
  position: string;
  image_url: string | null;
  difficulty_factors: DifficultyFactors;
}

const SEED_BANK: SeedEntry[] = [
  {
    player_name: 'Cristiano Ronaldo',
    career: [
      { club: 'Sporting CP', from: '2002', to: '2003' },
      { club: 'Manchester United', from: '2003', to: '2009' },
      { club: 'Real Madrid', from: '2009', to: '2018' },
      { club: 'Juventus', from: '2018', to: '2021' },
      { club: 'Manchester United', from: '2021', to: '2022' },
      { club: 'Al Nassr', from: '2023', to: 'Present' },
    ],
    nationality: 'Portuguese',
    position: 'Forward',
    image_url: 'https://www.thesportsdb.com/images/media/player/thumb/kezm671497991800.jpg',
    difficulty_factors: { event_year: 2018, competition: 'La Liga', fame_score: 10 },
  },
  {
    player_name: 'Lionel Messi',
    career: [
      { club: 'Barcelona', from: '2004', to: '2021' },
      { club: 'Paris Saint-Germain', from: '2021', to: '2023' },
      { club: 'Inter Miami', from: '2023', to: 'Present' },
    ],
    nationality: 'Argentine',
    position: 'Forward',
    image_url: 'https://www.thesportsdb.com/images/media/player/thumb/tqkj2j1524572952.jpg',
    difficulty_factors: { event_year: 2021, competition: 'La Liga', fame_score: 10 },
  },
  {
    player_name: 'Thierry Henry',
    career: [
      { club: 'Monaco', from: '1994', to: '1999' },
      { club: 'Juventus', from: '1999', to: '1999' },
      { club: 'Arsenal', from: '1999', to: '2007' },
      { club: 'Barcelona', from: '2007', to: '2010' },
      { club: 'New York Red Bulls', from: '2010', to: '2014' },
      { club: 'Arsenal', from: '2012', to: '2012' },
    ],
    nationality: 'French',
    position: 'Forward',
    image_url: null,
    difficulty_factors: { event_year: 2007, competition: 'Premier League', fame_score: 8 },
  },
  {
    player_name: 'Ronaldinho',
    career: [
      { club: 'Grêmio', from: '1998', to: '2001' },
      { club: 'Paris Saint-Germain', from: '2001', to: '2003' },
      { club: 'Barcelona', from: '2003', to: '2008' },
      { club: 'AC Milan', from: '2008', to: '2010' },
      { club: 'Flamengo', from: '2011', to: '2012' },
      { club: 'Atlético Mineiro', from: '2012', to: '2014' },
    ],
    nationality: 'Brazilian',
    position: 'Attacking Midfielder',
    image_url: null,
    difficulty_factors: { event_year: 2008, competition: 'La Liga', fame_score: 9 },
  },
  {
    player_name: 'Zlatan Ibrahimović',
    career: [
      { club: 'Malmö FF', from: '1999', to: '2001' },
      { club: 'Ajax', from: '2001', to: '2004' },
      { club: 'Juventus', from: '2004', to: '2006' },
      { club: 'Inter Milan', from: '2006', to: '2009' },
      { club: 'Barcelona', from: '2009', to: '2010' },
      { club: 'AC Milan', from: '2010', to: '2012' },
      { club: 'Paris Saint-Germain', from: '2012', to: '2016' },
      { club: 'Manchester United', from: '2016', to: '2018' },
      { club: 'LA Galaxy', from: '2018', to: '2019' },
      { club: 'AC Milan', from: '2020', to: '2023' },
    ],
    nationality: 'Swedish',
    position: 'Forward',
    image_url: null,
    difficulty_factors: { event_year: 2016, competition: 'Ligue 1', fame_score: 8 },
  },
];

@Injectable()
export class PlayerIdGenerator {
  private readonly logger = new Logger(PlayerIdGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(): Promise<GeneratedQuestion> {
    try {
      return await this.generateFromLlm();
    } catch (err) {
      this.logger.warn(`Player ID LLM generation failed, using seed: ${(err as Error).message}`);
      return this.getSeedQuestion();
    }
  }

  private async generateFromLlm(): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football expert. Generate a "Guess the Player" question where the player's career clubs are shown.
Pick any interesting footballer — could be legendary, retired, or current.
Return ONLY a valid JSON object with these exact fields:
{
  "player_name": "Full Name",
  "career": [{"club": "Club Name", "from": "YYYY", "to": "YYYY or Present"}],
  "nationality": "Nationality",
  "position": "Position",
  "image_url": null,
  "competition": "most notable league/competition where this player was famous e.g. Premier League",
  "event_year": 2018,
  "fame_score": 8
}
The career array should have at minimum 3 entries. Ensure the career data is factually accurate.
fame_score is 1-10: 10 = universally iconic (Messi/Ronaldo level), 1 = hyper-niche player.`;

    const userPrompt = `Generate a unique "guess the player" challenge with accurate career history. The player can be from any era or league. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<{
      player_name: string;
      career: CareerEntry[];
      nationality: string;
      position: string;
      image_url: string | null;
      competition: string;
      event_year: number;
      fame_score: number;
    }>(systemPrompt, userPrompt);

    if (!result.player_name || !result.career?.length) {
      throw new Error('Invalid player data from LLM');
    }

    const careerText = result.career
      .map((c) => `${c.club} (${c.from}–${c.to})`)
      .join(' → ');

    return {
      id: uuidv4(),
      category: 'PLAYER_ID',
      difficulty: 'EASY',
      points: 1,
      question_text: 'Identify the player from their career path:',
      correct_answer: result.player_name,
      fifty_fifty_hint: `${result.nationality} ${result.position}`,
      fifty_fifty_applicable: true,
      explanation: `The player is ${result.player_name}. Career: ${careerText}`,
      image_url: result.image_url,
      meta: { career: result.career, nationality: result.nationality, position: result.position },
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Unknown',
        fame_score: result.fame_score ?? null,
      },
    };
  }

  private getSeedQuestion(): GeneratedQuestion {
    const seed = SEED_BANK[Math.floor(Math.random() * SEED_BANK.length)];
    const careerText = seed.career.map((c) => `${c.club} (${c.from}–${c.to})`).join(' → ');
    return {
      id: uuidv4(),
      category: 'PLAYER_ID',
      difficulty: 'EASY',
      points: 1,
      question_text: 'Identify the player from their career path:',
      correct_answer: seed.player_name,
      fifty_fifty_hint: `${seed.nationality} ${seed.position}`,
      fifty_fifty_applicable: true,
      explanation: `The player is ${seed.player_name}. Career: ${careerText}`,
      image_url: seed.image_url,
      meta: { career: seed.career, nationality: seed.nationality, position: seed.position },
      difficulty_factors: seed.difficulty_factors,
    };
  }
}
