import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { QuestionsService } from '../questions/questions.service';
import { QuestionCategory } from '../questions/question.types';

type BlitzCategory = 'HISTORY' | 'GEOGRAPHY' | 'GOSSIP' | 'PLAYER_ID';

interface BandSpec {
  category: BlitzCategory;
  minScore: number;
  maxScore: number;
  target: number;
}

const BANDS: BandSpec[] = [
  { category: 'HISTORY',   minScore: 10, maxScore: 35, target: 20 },
  { category: 'HISTORY',   minScore: 40, maxScore: 65, target: 20 },
  { category: 'HISTORY',   minScore: 70, maxScore: 95, target: 20 },
  { category: 'GEOGRAPHY', minScore: 10, maxScore: 35, target: 20 },
  { category: 'GEOGRAPHY', minScore: 40, maxScore: 65, target: 20 },
  { category: 'GEOGRAPHY', minScore: 70, maxScore: 95, target: 20 },
  { category: 'GOSSIP',    minScore: 10, maxScore: 35, target: 20 },
  { category: 'GOSSIP',    minScore: 40, maxScore: 65, target: 20 },
  { category: 'GOSSIP',    minScore: 70, maxScore: 95, target: 20 },
  { category: 'PLAYER_ID', minScore: 50, maxScore: 95, target: 20 },
];

const GENERATION_BATCH_SIZE = 5;

function scoreToDifficulty(score: number): 'EASY' | 'MEDIUM' | 'HARD' {
  if (score <= 33) return 'EASY';
  if (score <= 66) return 'MEDIUM';
  return 'HARD';
}

function randomScore(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

@Injectable()
export class BlitzPoolSeederService implements OnModuleInit {
  private readonly logger = new Logger(BlitzPoolSeederService.name);
  private isSeeding = false;

  constructor(
    private supabaseService: SupabaseService,
    private llmService: LlmService,
    private questionsService: QuestionsService,
  ) {}

  async onModuleInit() {
    this.logger.log('[INIT] Blitz pool: checking initial levels...');
    this.seedIfLow(500).catch((err) =>
      this.logger.error(`[INIT] Blitz seed check failed: ${err.message}`),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledTopUp() {
    this.logger.log('[CRON] Blitz top-up (daily 3AM): checking band levels...');
    await this.seedPool();
  }

  async cleanupPool(): Promise<{ deletedInvalid: number; deletedDuplicates: number }> {
    const { data, error } = await this.supabaseService.client.rpc('cleanup_blitz_question_pool');
    if (error) {
      this.logger.error(`[blitz-seeder] cleanup RPC error: ${error.message}`);
      return { deletedInvalid: 0, deletedDuplicates: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    const deletedInvalid = Number(row?.deleted_invalid ?? 0);
    const deletedDuplicates = Number(row?.deleted_duplicates ?? 0);
    this.logger.log(`[blitz-seeder] Cleanup: removed ${deletedInvalid} invalid, ${deletedDuplicates} duplicates`);
    return { deletedInvalid, deletedDuplicates };
  }

  async seedPool(bandTarget?: number): Promise<{ band: string; added: number }[]> {
    if (this.isSeeding) {
      this.logger.warn('[blitz-seeder] Seeding already in progress, skipping');
      return [];
    }
    this.isSeeding = true;
    const results: { band: string; added: number }[] = [];

    try {
      const bandCounts = await this.getBandCounts();

      for (const band of BANDS) {
        const key = `${band.category}/${band.minScore}-${band.maxScore}`;
        const current = bandCounts[key] ?? 0;
        const target = bandTarget ?? band.target;
        const needed = Math.max(0, target - current);

        if (needed <= 0) {
          this.logger.log(`[blitz-seeder] ${key}: ${current}/${target} — ok`);
          results.push({ band: key, added: 0 });
          continue;
        }

        this.logger.log(`[blitz-seeder] ${key}: ${current}/${target} — generating ${needed}`);
        const added = await this.fillBand(band, needed);
        results.push({ band: key, added });
      }
    } finally {
      this.isSeeding = false;
    }

    return results;
  }

  private async seedIfLow(minTotal: number): Promise<void> {
    if (this.isSeeding) return;

    const total = await this.getTotalCount();
    if (total >= minTotal) {
      this.logger.log(`[INIT] Blitz pool: ${total} rows (>= ${minTotal}), skipping seed`);
      return;
    }

    this.logger.log(`[INIT] Blitz pool: ${total} rows (< ${minTotal}), seeding...`);
    await this.seedPool();
  }

  private async fillBand(band: BandSpec, count: number): Promise<number> {
    const existingKeys = await this.getExistingKeys(band.category);
    const rows: Array<{ category: string; difficulty_score: number; question: object }> = [];
    let slotIndex = 0;

    for (let offset = 0; offset < count; offset += GENERATION_BATCH_SIZE) {
      const batchSize = Math.min(GENERATION_BATCH_SIZE, count - offset);
      const results = await Promise.allSettled(
        Array.from({ length: batchSize }, () => {
          const score = randomScore(band.minScore, band.maxScore);
          const minorityScale = 100 - score;
          const difficulty = scoreToDifficulty(score);
          const idx = slotIndex++;
          return this.questionsService
            .generateOne(band.category as QuestionCategory, difficulty, 'en', {
              slotIndex: idx,
              minorityScale,
              forBlitz: true,
            })
            .then((q) => ({ q, score }));
        }),
      );

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const { q, score } = result.value;
        const key = `${q.question_text}|||${q.correct_answer}`;
        if (existingKeys.has(key)) {
          this.logger.log(`[blitz-seeder] Skipping duplicate: "${q.question_text}"`);
          continue;
        }
        existingKeys.add(key);
        rows.push({
          category: band.category,
          difficulty_score: score,
          question: {
            question_text: q.question_text,
            correct_answer: q.correct_answer,
            ...(q.wrong_choices?.length === 2 && { wrong_choices: q.wrong_choices }),
          },
        });
      }
    }

    if (rows.length === 0) return 0;

    let translations: Array<{ question_text: string; explanation: string }> = rows.map((r) => ({
      question_text: (r.question as { question_text: string }).question_text,
      explanation: '',
    }));
    try {
      translations = await this.llmService.translateToGreek(translations);
    } catch (err) {
      this.logger.warn(`[blitz-seeder] Greek translation failed, inserting without translations: ${(err as Error).message}`);
    }

    const rowsWithTranslations = rows.map((r, i) => ({
      ...r,
      translations: {
        el: {
          question_text: translations[i]?.question_text ?? (r.question as { question_text: string }).question_text,
        },
      },
    }));

    const { error } = await this.supabaseService.client
      .from('blitz_question_pool')
      .insert(rowsWithTranslations);

    if (error) {
      this.logger.error(`[blitz-seeder] Insert error for ${band.category}/${band.minScore}-${band.maxScore}: ${error.message}`);
      return 0;
    }

    this.logger.log(`[blitz-seeder] Inserted ${rows.length} for ${band.category}/${band.minScore}-${band.maxScore}`);
    return rows.length;
  }

  private async getExistingKeys(category: string): Promise<Set<string>> {
    const { data, error } = await this.supabaseService.client
      .from('blitz_question_pool')
      .select('question->question_text, question->correct_answer')
      .eq('category', category);

    if (error) {
      this.logger.error(`[blitz-seeder] getExistingKeys error: ${error.message}`);
      return new Set();
    }

    return new Set(
      (data as Array<{ question_text: string; correct_answer: string }>)
        .map((r) => `${r.question_text}|||${r.correct_answer}`),
    );
  }

  private async getBandCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.supabaseService.client
      .from('blitz_question_pool')
      .select('category, difficulty_score')
      .eq('used', false);

    if (error) {
      this.logger.error(`[blitz-seeder] getBandCounts error: ${error.message}`);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data as Array<{ category: string; difficulty_score: number }>) {
      for (const band of BANDS) {
        if (
          row.category === band.category &&
          row.difficulty_score >= band.minScore &&
          row.difficulty_score <= band.maxScore
        ) {
          const key = `${band.category}/${band.minScore}-${band.maxScore}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
    }
    return counts;
  }

  private async getTotalCount(): Promise<number> {
    const { count, error } = await this.supabaseService.client
      .from('blitz_question_pool')
      .select('id', { count: 'exact', head: true })
      .eq('used', false);

    if (error) {
      this.logger.error(`[blitz-seeder] getTotalCount error: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  }
}
