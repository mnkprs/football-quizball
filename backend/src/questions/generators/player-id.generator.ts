import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion } from '../question.types';


interface CareerEntry {
  club: string;
  from: string;
  to: string;
}

@Injectable()
export class PlayerIdGenerator {
  private readonly logger = new Logger(PlayerIdGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football expert. Generate a "Guess the Player" question where the player's career clubs are shown.
Pick any interesting footballer — legendary, retired, or current, from any era or league.
Return ONLY a valid JSON object with these exact fields:
{
  "player_name": "Full Name",
  "career": [{"club": "Club Name", "from": "YYYY", "to": "YYYY or Present"}],
  "nationality": "Nationality",
  "position": "Position",
  "wrong_player_name": "A different real player who played in a similar era/league (decoy for 50-50)",
  "image_url": null,
  "competition": "most notable league/competition where this player was famous e.g. Premier League",
  "event_year": 2018,
  "fame_score": 8
}
The career array must have at least 3 entries. All career data must be factually accurate.
fame_score is 1-10: 10 = universally iconic (Messi/Ronaldo level), 1 = hyper-niche player.`;

    const userPrompt = `Generate a unique "guess the player" challenge with accurate career history. The player can be from any era or league. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<{
      player_name: string;
      career: CareerEntry[];
      nationality: string;
      position: string;
      wrong_player_name: string;
      image_url: string | null;
      competition: string;
      event_year: number;
      fame_score: number;
    }>(systemPrompt, userPrompt);

    if (!result.player_name || !result.career?.length) {
      throw new Error('Invalid LLM response: missing player_name or career');
    }

    const careerText = result.career.map((c) => `${c.club} (${c.from}–${c.to})`).join(' → ');

    return {
      id: crypto.randomUUID(),
      category: 'PLAYER_ID',
      difficulty: 'EASY',
      points: 1,
      question_text: 'Identify the player from their career path:',
      correct_answer: result.player_name,
      fifty_fifty_hint: result.wrong_player_name || null,
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
}
