import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { MayhemQuestionGenerator } from './mayhem-question.generator';
import { MayhemStatGuessGenerator } from './mayhem-stat-guess.generator';
import { QuestionValidator } from '../questions/validators/question.validator';
import { QuestionIntegrityService } from '../questions/validators/question-integrity.service';
import { DifficultyScorer } from '../questions/difficulty-scorer.service';
import { GeneratedQuestion } from '../questions/question.types';
import { GENERATION_VERSION } from '../questions/config/generation-version.config';

const MAYHEM_POOL_TARGET = 20;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class MayhemService {
  private readonly logger = new Logger(MayhemService.name);
  private isIngesting = false;

  constructor(
    private readonly mayhemGenerator: MayhemQuestionGenerator,
    private readonly mayhemStatGuessGenerator: MayhemStatGuessGenerator,
    private readonly supabaseService: SupabaseService,
    private readonly questionValidator: QuestionValidator,
    private readonly questionIntegrity: QuestionIntegrityService,
    private readonly difficultyScorer: DifficultyScorer,
  ) {}

  async ingestMayhem(): Promise<{ added: number; skipped: number }> {
    if (this.isIngesting) {
      this.logger.warn('[ingestMayhem] Already ingesting, skipping');
      return { added: 0, skipped: 0 };
    }

    this.isIngesting = true;
    try {
      const current = await this.getMayhemPoolCount();
      if (current >= MAYHEM_POOL_TARGET) {
        this.logger.log(`[ingestMayhem] Pool has ${current} MAYHEM questions, skipping`);
        return { added: 0, skipped: 0 };
      }
      return await this.runIngestBatch();
    } finally {
      this.isIngesting = false;
    }
  }

  /** Force one generation pass regardless of current pool size. Used by seed script. */
  async forceIngestBatch(): Promise<{ added: number; skipped: number }> {
    if (this.isIngesting) {
      this.logger.warn('[forceIngestBatch] Already ingesting, skipping');
      return { added: 0, skipped: 0 };
    }
    this.isIngesting = true;
    try {
      return await this.runIngestBatch();
    } finally {
      this.isIngesting = false;
    }
  }

  private async runIngestBatch(): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    try {
      const [mcQuestions, statGuessQuestions] = await Promise.all([
        this.mayhemGenerator.generateBatch(),
        this.mayhemStatGuessGenerator.generateBatch(),
      ]);
      const questions = [...mcQuestions, ...statGuessQuestions];
      if (questions.length === 0) {
        this.logger.warn('[ingestMayhem] No questions generated');
        return { added: 0, skipped: 0 };
      }

      const existingKeys = await this.getExistingQuestionKeys();

      let validQuestions = questions.filter((q) => {
        const { valid, reason } = this.questionValidator.validate(q);
        if (!valid) {
          this.logger.debug(`[ingestMayhem] Rejected by validator: ${reason}`);
          skipped++;
          return false;
        }
        return true;
      });

      if (this.questionIntegrity.isEnabled) {
        const passed: typeof validQuestions = [];
        let integrityRejected = 0;
        for (const q of validQuestions) {
          const result = await this.questionIntegrity.verify(q);
          if (result.valid) {
            passed.push(q);
          } else {
            integrityRejected++;
            skipped++;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (integrityRejected > 0) {
          this.logger.log(`[ingestMayhem] Integrity rejected ${integrityRejected} MAYHEM questions`);
        }
        validQuestions = passed;
      }

      const rows = validQuestions
        .filter((q) => {
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) {
            skipped++;
            return false;
          }
          existingKeys.add(key);
          return true;
        })
        .map((q) => ({
          generation_version: GENERATION_VERSION,
          question: this.toPoolQuestion(q),
          raw_score: q.difficulty_factors ? this.difficultyScorer.score(q.difficulty_factors).raw : null,
        }));

      if (rows.length === 0) {
        this.logger.warn('[ingestMayhem] No valid questions to insert');
        return { added: 0, skipped };
      }

      const { error } = await this.supabaseService.client
        .from('mayhem_questions')
        .insert(rows);

      if (error) {
        this.logger.error(`[ingestMayhem] Insert error: ${error.message}`);
        return { added: 0, skipped };
      }

      added = rows.length;
      this.logger.log(`[ingestMayhem] Inserted ${added} MAYHEM questions (${skipped} skipped)`);
    } catch (err) {
      this.logger.error(`[runIngestBatch] Unexpected error: ${(err as Error).message}`);
    }

    return { added, skipped };
  }

  async getMayhemPoolCount(): Promise<number> {
    const { count, error } = await this.supabaseService.client
      .from('mayhem_questions')
      .select('id', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());

    if (error) {
      this.logger.error(`[getMayhemPoolCount] Error: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  }

  async getMayhemQuestions(
    excludeIds: string[] = [],
  ): Promise<Array<{ id: string; question_text: string; options: string[] }>> {
    const { data, error } = await this.supabaseService.client
      .from('mayhem_questions')
      .select('id, question')
      .gt('expires_at', new Date().toISOString())
      .limit(50);

    if (error) {
      this.logger.error(`[getMayhemQuestions] Error: ${error.message}`);
      return [];
    }

    return (data ?? [])
      .filter((r: { id: string }) => !excludeIds.includes(r.id))
      .map((r: { id: string; question: Record<string, unknown> }) => {
        const q = r.question;
        const correctAnswer = q['correct_answer'] as string;
        const wrongChoices = (q['wrong_choices'] as string[]) ?? [];
        const options = shuffleArray([correctAnswer, ...wrongChoices.slice(0, 3)]);
        return {
          id: r.id,
          question_text: q['question_text'] as string,
          options,
        };
      });
  }

  async checkMayhemAnswer(
    questionId: string,
    selectedAnswer: string,
  ): Promise<{ correct: boolean; correct_answer: string; explanation: string } | null> {
    const { data, error } = await this.supabaseService.client
      .from('mayhem_questions')
      .select('question')
      .eq('id', questionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;

    const q = (data as { question: Record<string, string> }).question;
    const correctAnswer = q['correct_answer'] ?? '';
    const correct = selectedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

    return {
      correct,
      correct_answer: correctAnswer,
      explanation: q['explanation'] ?? '',
    };
  }

  async expireOldMayhem(): Promise<number> {
    const { data, error } = await this.supabaseService.client.rpc('expire_mayhem_questions');
    if (error) {
      this.logger.error(`[expireOldMayhem] Error: ${error.message}`);
      return 0;
    }
    const deleted = (data as number) ?? 0;
    if (deleted > 0) {
      this.logger.log(`[expireOldMayhem] Deleted ${deleted} MAYHEM questions older than 30 days`);
    }
    return deleted;
  }

  private toPoolQuestion(q: GeneratedQuestion): object {
    return {
      question_text: q.question_text,
      correct_answer: q.correct_answer,
      wrong_choices: q.wrong_choices ?? [],
      explanation: q.explanation,
      category: q.category,
      difficulty: q.difficulty,
      source_url: q.source_url ?? null,
    };
  }

  private async getExistingQuestionKeys(): Promise<Set<string>> {
    const { data, error } = await this.supabaseService.client
      .from('mayhem_questions')
      .select('question');

    if (error) {
      this.logger.error(`[getExistingQuestionKeys] Error: ${error.message}`);
      return new Set();
    }

    return new Set(
      (data as Array<{ question: { question_text?: string; correct_answer?: string } }>)
        .filter((r) => r.question?.question_text && r.question?.correct_answer)
        .map((r) => `${r.question.question_text}|||${r.question.correct_answer}`),
    );
  }
}
