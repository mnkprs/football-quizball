import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { GeneratedQuestion } from '../questions/question.types';

const STAT_GUESS_BATCH_SIZE = 5;

/**
 * Stat categories to diversify question topics across batches.
 */
const STAT_GUESS_TOPIC_SEEDS = [
  'goals scored in a single domestic league season',
  'international caps (appearances) for a national team',
  'assists in a single Champions League campaign',
  'goals scored across an entire World Cup tournament',
  'clean sheets kept in a domestic season (goalkeeper)',
  'appearances (games played) for a single club in all competitions',
  'goals scored in a single Copa América or AFCON tournament',
  'transfer fee (in millions) for a specific player move',
  'career goals for a specific club',
  'hat-tricks scored in a single domestic league season',
] as const;

/**
 * Era seeds to spread questions across different time periods.
 */
const STAT_GUESS_ERA_SEEDS = [
  '1970s and 1980s football records',
  '1990s football stats (World Cups, European club competitions)',
  '2000s football (2000-2009 league and cup stats)',
  '2010s football (2010-2019 records)',
  'modern era 2020s football statistics',
] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface StatGuessPayload {
  player: string;
  stat_description: string;
  shown_value: number;
  real_value: number;
  close_decoy: number;
  far_decoy: number;
  competition: string;
  season: string;
  event_year: number;
  fame_score: number;
  question_text: string;
  explanation: string;
  source_url?: string;
}

@Injectable()
export class MayhemStatGuessGenerator {
  private readonly logger = new Logger(MayhemStatGuessGenerator.name);

  constructor(private readonly llmService: LlmService) {}

  async generateBatch(): Promise<GeneratedQuestion[]> {
    const topic = pickRandom(STAT_GUESS_TOPIC_SEEDS);
    const era = pickRandom(STAT_GUESS_ERA_SEEDS);

    const systemPrompt = `You are an elite football statistics expert. Generate ${STAT_GUESS_BATCH_SIZE} "Stat Guess" questions.

Each question embeds a WRONG number in the question text, then the player must pick the REAL number from 4 choices.

QUESTION STRUCTURE:
- question_text: Embeds "shown_value" directly (e.g. "Did Bergkamp score 12 goals in the 1999-00 Champions League?"). The shown_value is ALWAYS wrong.
- real_value: The true correct stat — the player must find this among 4 options.
- shown_value: A plausible but WRONG number embedded in the question (20–40% different from real_value, either above or below).
- close_decoy: A number close to real_value (within 1–3 units for small stats, or ~10–20% for larger stats). Different from all others.
- far_decoy: A number far from real_value (>50% different). Different from all others.

REQUIREMENTS:
- All 4 values (real_value, shown_value, close_decoy, far_decoy) MUST be distinct positive integers.
- Facts must be 100% verifiable. When in doubt, skip.
- Focus on: lesser-known players, non-big-5 leagues, exact historical stats, non-obvious records.
- Era focus: ${era}
- Topic focus: ${topic}
- The question_text must clearly embed shown_value as a specific number claim (e.g. "scored X goals", "earned Y caps", "cost Z million").
- explanation: State the real_value clearly and add a brief interesting fact.

Return ONLY valid JSON:
{
  "questions": [
    {
      "player": "Full Player Name",
      "stat_description": "brief stat label (e.g. 'goals in the 2003-04 Champions League')",
      "shown_value": 12,
      "real_value": 8,
      "close_decoy": 7,
      "far_decoy": 18,
      "competition": "Competition name",
      "season": "YYYY-YY or YYYY",
      "event_year": 2004,
      "fame_score": 5,
      "question_text": "Full question sentence with shown_value embedded",
      "explanation": "The real answer is X. [brief context]",
      "source_url": "URL to verify (Wikipedia, transfermarkt, official stats)"
    }
  ]
}
fame_score: 1–10 (10 = iconic, 1 = very obscure).`;

    const userPrompt = `Generate ${STAT_GUESS_BATCH_SIZE} Stat Guess football questions. Make them genuinely hard — obscure stats where the shown number looks plausible but the real answer requires knowledge. Return JSON only.`;

    try {
      const result = await this.llmService.generateStructuredJson<{
        questions: StatGuessPayload[];
      }>(systemPrompt, userPrompt);

      const questions = result?.questions ?? [];
      if (!Array.isArray(questions) || questions.length === 0) {
        this.logger.warn('[MayhemStatGuessGenerator] No questions in LLM response');
        return [];
      }

      return questions
        .filter((q) => this.isValidPayload(q))
        .map((q) => this.toGeneratedQuestion(q));
    } catch (err) {
      this.logger.error(`[MayhemStatGuessGenerator] Failed: ${(err as Error).message}`);
      return [];
    }
  }

  private isValidPayload(q: StatGuessPayload): boolean {
    if (!q.player?.trim() || !q.question_text?.trim() || !q.explanation?.trim()) return false;
    if (q.real_value === undefined || q.shown_value === undefined) return false;
    if (q.close_decoy === undefined || q.far_decoy === undefined) return false;

    const values = [q.real_value, q.shown_value, q.close_decoy, q.far_decoy];
    if (values.some((v) => !Number.isInteger(v) || v <= 0)) return false;

    // All 4 choices must be distinct
    if (new Set(values).size !== 4) return false;

    return true;
  }

  private toGeneratedQuestion(q: StatGuessPayload): GeneratedQuestion {
    // correct_answer is the real value; the 3 wrong choices are the shown value + 2 decoys
    const correctAnswer = String(q.real_value);
    const wrongChoices = [String(q.shown_value), String(q.close_decoy), String(q.far_decoy)];

    return {
      id: crypto.randomUUID(),
      category: 'MAYHEM',
      difficulty: 'HARD',
      points: 3,
      question_text: q.question_text.trim(),
      correct_answer: correctAnswer,
      wrong_choices: wrongChoices,
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: q.explanation.trim(),
      source_url: typeof q.source_url === 'string' && q.source_url.trim() ? q.source_url.trim() : undefined,
      image_url: null,
      meta: {
        subtype: 'STAT_GUESS',
        player: q.player,
        stat_description: q.stat_description,
        shown_value: q.shown_value,
        real_value: q.real_value,
        competition: q.competition,
        season: q.season,
      },
      difficulty_factors: {
        event_year: q.event_year ?? new Date().getFullYear(),
        competition: q.competition ?? 'World Football',
        fame_score: q.fame_score ?? 3,
        category: 'MAYHEM',
        answer_type: 'number',
        specificity_score: 9,
        combinational_thinking_score: 7,
      },
    };
  }
}
