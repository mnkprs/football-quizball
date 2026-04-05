import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { GeneratedQuestion } from '../questions/question.types';

const MAYHEM_BATCH_SIZE = 10;

/**
 * Era anchors — rotating across these ensures consecutive mayhem passes cover different history.
 */
const MAYHEM_ERA_SEEDS = [
  '1950s and 1960s football (pre-Pele era records, early World Cups)',
  '1970s football (World Cups, European Cups, continental champions)',
  '1980s football (records, transfers, club history)',
  '1990s football (World Cups, Champions League era, record transfers)',
  '2000s football (early 2000s records, transfers, World Cups 2002/2006)',
  '2010s football (2010-2019 era, obscure records and stats)',
  'all-time historical records (goals, caps, trophies across any era)',
] as const;

/**
 * Regional/continental anchors — so each pass explores a different part of world football.
 */
const MAYHEM_REGION_SEEDS = [
  'African football (CAF, AFCON records, African clubs, African players in European leagues)',
  'Asian and Oceanian football (AFC, OFC, J-League records, South Korean football, Asian Cup)',
  'South American football (CONMEBOL history, Libertadores records, Copa América obscure facts)',
  'CONCACAF football (Mexican league history, Central American and Caribbean football, Gold Cup)',
  'Eastern European football (Polish, Romanian, Ukrainian, Bulgarian, Czech, Slovak league history)',
  'Nordic and Balkan football (Scandinavian leagues, Balkan cups, lesser-known European nations)',
  'non-top-5 European leagues (Scottish, Turkish, Greek, Portuguese, Dutch, Belgian league history)',
] as const;

/**
 * Stat/topic type anchors — diversifies the TYPE of question within each batch.
 */
const MAYHEM_TOPIC_SEEDS = [
  'exact transfer fees, loan deals, and record signings for specific clubs or seasons',
  'international caps, debut ages, and retirement ages for players from specific nations',
  'domestic cup records: most wins, top scorers, consecutive finals appearances',
  'red cards, suspensions, and disciplinary records in tournaments or seasons',
  'goalkeeping records: clean sheets, saves, penalty saves in specific competitions',
  'own goals, penalty misses, and famous errors in high-stakes matches',
  'managerial records: youngest, oldest, shortest tenures, most trophies in a single league',
  'stadium capacities, attendances, and record crowd figures at specific grounds',
] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Builds a random diversity anchor for a mayhem batch.
 * By randomising era, region, and topic type, consecutive mayhem seed runs
 * diverge across different parts of football knowledge instead of converging
 * on the same "obscure records" territory.
 */
function buildMayhemDiversityAnchor(): string {
  const era = pickRandom(MAYHEM_ERA_SEEDS);
  const region = pickRandom(MAYHEM_REGION_SEEDS);
  const topic = pickRandom(MAYHEM_TOPIC_SEEDS);
  return `
DIVERSITY ANCHOR FOR THIS BATCH (mandatory — use to spread questions across different territory):
- Era focus: ${era}
- Regional focus: ${region}
- Topic/stat focus: ${topic}
Distribute questions across ALL THREE anchors. Do NOT put more than 3 questions in any single anchor. Mix era, region, and topic combinations across the ${MAYHEM_BATCH_SIZE} questions so this batch covers different territory from a previous run.`;
}

@Injectable()
export class MayhemQuestionGenerator {
  private readonly logger = new Logger(MayhemQuestionGenerator.name);

  constructor(private readonly llmService: LlmService) {}

  async generateBatch(): Promise<GeneratedQuestion[]> {
    const diversityAnchor = buildMayhemDiversityAnchor();

    const systemPrompt = `You are an elite football trivia expert specializing in EXTREMELY hard, obscure football knowledge from around the world.

Generate ${MAYHEM_BATCH_SIZE} multiple-choice football trivia questions that are genuinely difficult — designed to challenge even hardcore football fans.

REQUIREMENTS:
- Facts must be 100% verifiable and accurate. When in doubt, skip the question.
- Focus EXCLUSIVELY on: exact stats/numbers, lesser-known records, non-big-5-league history, precise transfer fees, exact years/scores/dates, obscure player achievements, world football outside England/Spain/Germany/Italy/France.
- Worldwide scope: Africa (CAF), Asia (AFC), South America (CONMEBOL), Eastern Europe, historic records, lower divisions, national team obscurities.
- AVOID: questions about Messi/Ronaldo/top-5 common facts, Champions League finals everyone knows, obvious World Cup records.
- The correct answer must be SHORT: 1-5 words (exact number, name, year, club, country).
- Provide exactly 3 wrong choices: plausible but incorrect, same type/format as correct answer (name→name, year→year, number→number). Make them deceptive — similar enough to confuse.
- No 50/50 hint needed.
${diversityAnchor}
Return ONLY a valid JSON object:
{
  "questions": [
    {
      "question_text": "the question",
      "correct_answer": "short answer",
      "wrong_choices": ["wrong1", "wrong2", "wrong3"],
      "explanation": "brief explanation why this is the answer",
      "source_url": "URL to verify (Wikipedia, transfermarkt, official stats, etc.)"
    }
  ]
}`;

    const userPrompt = `Generate ${MAYHEM_BATCH_SIZE} extremely hard, obscure football trivia questions with multiple choice answers. Follow the DIVERSITY ANCHOR above to distribute questions across different eras, regions, and topics. Return JSON only.`;

    try {
      const result = await this.llmService.generateStructuredJson<{
        questions: Array<{
          question_text: string;
          correct_answer: string;
          wrong_choices: string[];
          explanation: string;
          source_url?: string;
        }>;
      }>(systemPrompt, userPrompt);

      const questions = result?.questions ?? [];
      if (!Array.isArray(questions) || questions.length === 0) {
        this.logger.warn('[MayhemQuestionGenerator] No questions in LLM response');
        return [];
      }

      return questions
        .filter((q) => {
          if (!q.question_text?.trim() || !q.correct_answer?.trim()) return false;
          if (!Array.isArray(q.wrong_choices) || q.wrong_choices.length < 3) return false;
          return true;
        })
        .map((q) => this.toGeneratedQuestion(q));
    } catch (err) {
      this.logger.error(`[MayhemQuestionGenerator] Failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toGeneratedQuestion(q: {
    question_text: string;
    correct_answer: string;
    wrong_choices: string[];
    explanation?: string;
    source_url?: string;
  }): GeneratedQuestion {
    const id = crypto.randomUUID();
    return {
      id,
      category: 'MAYHEM',
      difficulty: 'HARD',
      points: 3,
      question_text: q.question_text.trim(),
      correct_answer: q.correct_answer.trim(),
      wrong_choices: q.wrong_choices.map((w) => w.trim()).slice(0, 3),
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: q.explanation?.trim() || '',
      source_url: typeof q.source_url === 'string' && q.source_url.trim() ? q.source_url.trim() : undefined,
      image_url: null,
      difficulty_factors: {
        event_year: new Date().getFullYear(),
        competition: 'World Football',
        fame_score: 2,
        category: 'MAYHEM',
        answer_type: 'mixed',
        specificity_score: 10,
        combinational_thinking_score: 10,
      },
    };
  }
}
