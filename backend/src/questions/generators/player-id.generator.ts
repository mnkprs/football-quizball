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

  async generate(language: string = 'en'): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
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
  "fame_score": 8,
  "specificity_score": 3,
  "question_text": "Question prompt shown to the player",
  "explanation": "Brief explanation naming the player and career summary"
}
The career array must have at least 3 entries. All career data must be factually accurate.
fame_score is 1-10: 10 = universally iconic (Messi/Ronaldo level), 1 = hyper-niche player.
specificity_score is 1-5: 1 = iconic player with unique club path, 3 = known player but career path not top-of-mind, 5 = obscure player few would recognize.${langInstruction}`;

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
      specificity_score?: number;
      question_text?: string;
      explanation?: string;
    }>(systemPrompt, userPrompt);

    if (!result.player_name || !result.career?.length) {
      throw new Error('Invalid LLM response: missing player_name or career');
    }

    const careerText = result.career.map((c) => `${c.club} (${c.from}–${c.to})`).join(' → ');

    const question_text = result.question_text ?? 'Identify the player from their career path:';
    const explanation = result.explanation ?? `The player is ${result.player_name}. Career: ${careerText}`;

    return {
      id: crypto.randomUUID(),
      category: 'PLAYER_ID',
      difficulty: 'EASY',
      points: 1,
      question_text,
      correct_answer: result.player_name,
      fifty_fifty_hint: result.wrong_player_name || null,
      fifty_fifty_applicable: true,
      explanation,
      image_url: result.image_url,
      meta: { career: result.career, nationality: result.nationality, position: result.position },
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Unknown',
        fame_score: result.fame_score ?? null,
        category: 'PLAYER_ID',
        answer_type: 'name',
        specificity_score: result.specificity_score ?? 3,
      },
    };
  }
}
