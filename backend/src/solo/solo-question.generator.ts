import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { Difficulty, resolveQuestionPoints } from '../questions/question.types';
import { SoloQuestion } from './solo.types';
import { GeneratedQuestion } from '../common/interfaces/question.interface';
import {
  getExplicitConstraints,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  minorityScaleForElo,
} from '../questions/diversity-hints';

@Injectable()
export class SoloQuestionGenerator {
  private readonly logger = new Logger(SoloQuestionGenerator.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly questionPoolService: QuestionPoolService,
  ) {}

  /**
   * Maps a raw LLM JSON response to a SoloQuestion, including optional analytics_tags.
   * Exposed as a static method for unit-testability.
   */
  static mapLlmOutputToQuestion(raw: any, difficulty: string): SoloQuestion {
    return {
      id: `solo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      question_text: raw.question_text,
      correct_answer: raw.correct_answer,
      explanation: raw.explanation,
      difficulty: difficulty as Difficulty,
      difficulty_factor: raw.difficulty_factor,
      category: 'HISTORY',
      points: 10,
      analytics_tags: raw.analytics_tags
        ? {
            league_tier: raw.analytics_tags.league_tier,
            competition_type: raw.analytics_tags.competition_type,
            era: raw.analytics_tags.era,
            event_year: raw.analytics_tags.event_year,
            nationality: raw.analytics_tags.nationality,
          }
        : undefined,
    };
  }

  async generate(difficulty: Difficulty, elo: number = 1000, excludeIds: string[] = []): Promise<SoloQuestion> {
    // Use pool first — no LLM call when questions exist in DB
    const fromPool = await this.questionPoolService.drawOneForSolo(difficulty, excludeIds);
    if (fromPool) {
      this.logger.debug(`[generate] Using pool question ${fromPool.id} (${fromPool.category}/${difficulty})`);
      return {
        id: fromPool.id,
        question_text: fromPool.question_text,
        correct_answer: fromPool.correct_answer,
        explanation: fromPool.explanation ?? '',
        difficulty,
        difficulty_factor: 0.5,
        category: fromPool.category,
        points: fromPool.points,
      };
    }

    this.logger.warn(
      `[generate] Pool empty for difficulty=${difficulty} — falling back to LLM. ` +
        'Seed the pool via POST /api/admin/seed-pool?target=5 to avoid LLM calls.',
    );
    // Pool empty — fall back to LLM
    const difficultyGuide: Record<Difficulty, string> = {
      EASY: 'well-known fact, easily recalled (e.g., which club did Messi win the 2015 Champions League with?)',
      MEDIUM: 'moderate difficulty, requires real football knowledge (e.g., year of a specific title win, top scorer in a specific season)',
      HARD: 'highly specific, niche fact only a true enthusiast would know (e.g., exact transfer fee, squad number in a specific year, obscure stat)',
      EXPERT: 'extremely niche, elite-level football trivia that only the most dedicated fans would know (e.g., specific substitute appearance minutes, youth academy transfer details, obscure continental cup records)',
    };

    const systemPrompt = `You are a football trivia expert generating solo ranked quiz questions.
Generate a single football question. The question should be ${difficultyGuide[difficulty]}.
Cover any football topic: history, players, clubs, transfers, trophies, scores, records, gossip, geography.
Phrase questions to be SPECIFIC and harder to Google quickly (avoid simple "who scored in the 2014 World Cup final" style).
The answer must be a SHORT, precise text answer (a name, number, year, score, or country — NOT a long sentence).${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY valid JSON:
{
  "question_text": "...",
  "correct_answer": "...",
  "explanation": "...",
  "difficulty_factor": 0.5,
  "analytics_tags": { ... }
}
difficulty_factor: float 0.1–1.0 (how hard within the difficulty tier)

Also classify the question with analytics_tags:
- league_tier: 1 for top-5 EU leagues (EPL/La Liga/Bundesliga/Serie A/Ligue 1); 2 for other EU top flights; 3 for other pro leagues (MLS/Brasileirão/J-League); 4 for lower divisions; 5 for amateur/misc. Null if not league-specific.
- competition_type: domestic_league | domestic_cup | continental_club (UCL/UEL/Copa Libertadores) | international_national (World Cup/Euros) | youth | friendly | other
- era: pre_1990 | 1990s | 2000s | 2010s | 2020s (based on event_year)
- event_year: 4-digit year the event took place, if applicable
- nationality: ISO 3166-1 alpha-2 code of primary subject when the answer is a player

Omit fields you are not confident about; do not guess.`;

    const schema = {
      type: 'object',
      properties: {
        question_text: { type: 'string' },
        correct_answer: { type: 'string' },
        explanation: { type: 'string' },
        difficulty_factor: { type: 'number', minimum: 0.1, maximum: 1.0 },
        analytics_tags: {
          type: 'object',
          properties: {
            league_tier: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
            competition_type: {
              type: 'string',
              enum: [
                'domestic_league',
                'domestic_cup',
                'continental_club',
                'international_national',
                'youth',
                'friendly',
                'other',
              ],
              nullable: true,
            },
            era: {
              type: 'string',
              enum: ['pre_1990', '1990s', '2000s', '2010s', '2020s'],
              nullable: true,
            },
            event_year: { type: 'integer', minimum: 1850, maximum: 2100, nullable: true },
            nationality: { type: 'string', nullable: true },
          },
          nullable: true,
        },
      },
      required: ['question_text', 'correct_answer', 'explanation', 'difficulty_factor'],
    };

    const scale = minorityScaleForElo(elo);
    const diversityConstraints = getExplicitConstraints('HISTORY', undefined, scale);
    const userPrompt = `Generate a ${difficulty} football trivia question. Return only the JSON object.${diversityConstraints}`;

    const raw = await this.llmService.generateStructuredJson<{
      question_text: string;
      correct_answer: string;
      explanation: string;
      difficulty_factor: number;
      analytics_tags?: {
        league_tier?: number;
        competition_type?: string;
        era?: string;
        event_year?: number;
        nationality?: string;
      };
    }>(systemPrompt, userPrompt);

    const mapped = SoloQuestionGenerator.mapLlmOutputToQuestion(raw, difficulty);

    return {
      id: mapped.id,
      question_text: mapped.question_text,
      correct_answer: mapped.correct_answer,
      explanation: mapped.explanation,
      difficulty,
      difficulty_factor: Math.max(0.1, Math.min(1.0, raw.difficulty_factor ?? 0.5)),
      category: 'HISTORY',
      points: resolveQuestionPoints('HISTORY', difficulty),
      analytics_tags: mapped.analytics_tags,
    };
  }
}
