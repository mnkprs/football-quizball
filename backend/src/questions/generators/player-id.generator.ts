import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, Difficulty } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface CareerEntry {
  club: string;
  from: string;
  to: string;
}

const SEED_BANK = [
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
  },
];

@Injectable()
export class PlayerIdGenerator {
  private readonly logger = new Logger(PlayerIdGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    try {
      return await this.generateFromLlm(difficulty, points);
    } catch (err) {
      this.logger.warn(`Player ID LLM generation failed, using seed: ${(err as Error).message}`);
      return this.getSeedQuestion(difficulty, points);
    }
  }

  private async generateFromLlm(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    const difficultyContext = {
      EASY: 'a very famous player like Messi, Ronaldo, Neymar, Mbappe',
      MEDIUM: 'a well-known player who has played for 3+ major clubs',
      HARD: 'a less obvious player with an interesting career path across multiple leagues',
    }[difficulty];

    const systemPrompt = `You are a football expert. Generate a "Guess the Player" question where the player's career clubs are shown.
The player should be ${difficultyContext}.
Return ONLY a valid JSON object with these exact fields:
{
  "player_name": "Full Name",
  "career": [{"club": "Club Name", "from": "YYYY", "to": "YYYY or Present"}],
  "nationality": "Nationality",
  "position": "Position",
  "image_url": null
}
The career array should have at minimum 3 entries. Ensure the career data is factually accurate.`;

    const userPrompt = `Generate a unique ${difficulty} level "guess the player" challenge with accurate career history. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<{
      player_name: string;
      career: CareerEntry[];
      nationality: string;
      position: string;
      image_url: string | null;
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
      difficulty,
      points,
      question_text: 'Identify the player from their career path:',
      correct_answer: result.player_name,
      fifty_fifty_hint: `${result.nationality} ${result.position}`,
      fifty_fifty_applicable: true,
      explanation: `The player is ${result.player_name}. Career: ${careerText}`,
      image_url: result.image_url,
      meta: { career: result.career, nationality: result.nationality, position: result.position },
    };
  }

  private getSeedQuestion(difficulty: Difficulty, points: number): GeneratedQuestion {
    // Pick based on difficulty: easy = Messi/Ronaldo, medium = Henry/Ronaldinho, hard = Zlatan
    const pools = {
      EASY: [SEED_BANK[0], SEED_BANK[1]],
      MEDIUM: [SEED_BANK[2], SEED_BANK[3]],
      HARD: [SEED_BANK[4]],
    };
    const pool = pools[difficulty];
    const seed = pool[Math.floor(Math.random() * pool.length)];
    const careerText = seed.career.map((c) => `${c.club} (${c.from}–${c.to})`).join(' → ');

    return {
      id: uuidv4(),
      category: 'PLAYER_ID',
      difficulty,
      points,
      question_text: 'Identify the player from their career path:',
      correct_answer: seed.player_name,
      fifty_fifty_hint: `${seed.nationality} ${seed.position}`,
      fifty_fifty_applicable: true,
      explanation: `The player is ${seed.player_name}. Career: ${careerText}`,
      image_url: seed.image_url,
      meta: { career: seed.career, nationality: seed.nationality, position: seed.position },
    };
  }
}
