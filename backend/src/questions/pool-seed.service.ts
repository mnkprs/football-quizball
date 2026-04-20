import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { QuestionsService } from './questions.service';
import { QuestionValidator } from './validators/question.validator';
import { QuestionIntegrityService } from './validators/question-integrity.service';
import {
  QuestionClassifierService,
  ClassifierOutput,
} from './classifiers/question-classifier.service';
import {
  CanonicalIndex,
  loadCanonicalEntities,
} from './classifiers/canonical-entities';
import { SteeringService, type BatchSteeringPlan } from './steering';
import { RedisService } from '../redis/redis.service';
import {
  BoardCategory,
  GeneratedQuestion,
  QuestionCategory,
  Difficulty,
  CATEGORY_BATCH_SIZES,
  CATEGORY_DIFFICULTY_SLOTS,
  resolveQuestionPoints,
} from './config';
import {
  buildDrawRequirements,
  parseSlotKey,
  POOL_TARGET,
  DEFAULT_POOL_TARGET,
  GENERATION_BATCH_SIZE,
  MAX_CATEGORY_BATCH_ATTEMPTS,
  BATCH_THROTTLE_MS,
  DUPLICATE_RETRY_ATTEMPTS,
  SEED_CATEGORY_CONCURRENCY,
} from './config/pool.config';
import { RAW_THRESHOLD_EASY, RAW_THRESHOLD_MEDIUM } from './config/difficulty-scoring.config';
import { GENERATION_VERSION } from './config/generation-version.config';
import { LIVE_CATEGORIES } from './config/category.config';
import type {
  PoolStatsRow,
  SeedPoolStatsRow,
  ExistingQuestionRow,
} from '../common/interfaces/pool.interface';

const DRAW_REQUIREMENTS = buildDrawRequirements();
const REFILL_ADVISORY_LOCK_KEY = 987654321;

@Injectable()
export class PoolSeedService {
  private readonly logger = new Logger(PoolSeedService.name);

  constructor(
    private supabaseService: SupabaseService,
    private llmService: LlmService,
    private questionsService: QuestionsService,
    private questionValidator: QuestionValidator,
    private questionIntegrity: QuestionIntegrityService,
    private questionClassifier: QuestionClassifierService,
    private steeringService: SteeringService,
    private redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resolve the canonical entity index. `loadCanonicalEntities` maintains its
   * own module-level cache — we just wrap the read with a graceful fallback
   * so a missing / unreadable JSON file never blocks pool seeding.
   */
  private getCanonicalIndex(): CanonicalIndex | null {
    try {
      return loadCanonicalEntities();
    } catch (err) {
      this.logger.warn(
        `[classifier] canonical entities not loadable — new questions will be inserted without taxonomy. ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Classify a batch of generated questions against the canonical list.
   * Runs sequentially to avoid Gemini 429s (same constraint as integrity
   * verification). Returns a map keyed by question id; questions that fail to
   * classify are absent from the map and their row inserts with null taxonomy.
   */
  private async classifyBatch(
    questions: GeneratedQuestion[],
    category: QuestionCategory,
    difficulty: Difficulty,
  ): Promise<Map<string, ClassifierOutput>> {
    const canonical = this.getCanonicalIndex();
    const out = new Map<string, ClassifierOutput>();
    if (!canonical) return out;

    for (const q of questions) {
      try {
        const res = await this.questionClassifier.classify(
          {
            id: q.id,
            category,
            difficulty,
            question_text: q.question_text,
            correct_answer: q.correct_answer,
            explanation: q.explanation,
          },
          canonical,
        );
        out.set(q.id, res.classification);
        if (res.warnings.length > 0) {
          this.logger.debug(
            `[classifier] ${q.id}: ${res.warnings.join(' | ')}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `[classifier] failed for ${q.id}: ${(err as Error).message} — inserting with null taxonomy`,
        );
      }
    }
    return out;
  }

  /**
   * Seeds a single slot (e.g. GUESS_SCORE/MEDIUM) with generated questions.
   * Uses the same batch logic as seedPool: generateBatch, validate, deduplicate, insert.
   * Runs passes until target count is reached (not batched across categories).
   * @param slotKey Format: CATEGORY/DIFFICULTY (NEWS not allowed — use ingest cron).
   */
  async seedSlot(slotKey: string, count: number, force = false): Promise<{ slot: string; added: number; questions?: string[] }> {
    const { category, difficulty } = parseSlotKey(slotKey);

    const toAdd = Math.min(500, Math.max(1, count));
    const run = async () => {
      const key = `${category}/${difficulty}`;
      this.logger.debug(`[seedSlot] ${key}: adding ${toAdd} questions (batch logic)`);
      const { added, questionIds } = await this.seedSlotPasses(category, difficulty, toAdd);
      return { slot: key, added, questions: questionIds };
    };
    return force ? run() : this.withRefillLock(run);
  }

  /**
   * Seeds all live categories with generated questions. Skips NEWS (use ingest cron).
   * @param count Number of passes per category (each pass adds a batch).
   * @param force Bypass refill lock (e.g. for CLI scripts).
   */
  async seedPool(
    count: number,
    force = false,
    options?: { minDrawable?: number },
  ): Promise<{ results: { slot: string; added: number }[]; sessionId: string | null; questionIds: string[] }> {
    const passes = Math.min(500, Math.max(1, count));
    const minDrawable = options?.minDrawable;
    const runSeedPool = async () => {
      const results: { slot: string; added: number }[] = [];
      const allQuestionIds: string[] = [];
      let completed = false;
      this.logger.debug(JSON.stringify({ event: 'seed_pool_start', passes, minDrawable: minDrawable ?? null }));

      try {
        let categories = this.getLiveCategories();

        // When minDrawable is set, skip categories where every slot already meets the threshold.
        if (minDrawable != null) {
          const stats = await this.getSeedPoolStats();
          const belowThreshold = new Set<string>();
          for (const row of stats) {
            if (Number(row.drawable_unanswered ?? 0) < minDrawable) {
              belowThreshold.add(row.category);
            }
          }
          const before = categories.length;
          categories = categories.filter((c) => belowThreshold.has(c));
          const skipped = before - categories.length;
          if (skipped > 0) {
            this.logger.debug(`[seedPool] minDrawable=${minDrawable}: skipped ${skipped} categories already at/above threshold`);
          }
          if (categories.length === 0) {
            this.logger.debug(`[seedPool] All categories at or above ${minDrawable} drawable_unanswered — nothing to seed`);
          }
        }

        // Process categories in parallel batches of SEED_CATEGORY_CONCURRENCY.
        // Each category has its own isolated existingKeys Set (loaded per-category from DB),
        // so there is no shared state between parallel category tasks.
        for (let i = 0; i < categories.length; i += SEED_CATEGORY_CONCURRENCY) {
          const batch = categories.slice(i, i + SEED_CATEGORY_CONCURRENCY);
          const batchResults = await Promise.all(
            batch.map(async (category) => {
              this.logger.debug(`[seedPool] Starting ${category}: ${passes} pass${passes === 1 ? '' : 'es'}`);
              const { addedTotals, questionIds } = await this.seedCategoryPasses(category, passes);
              const totalAdded = Object.values(addedTotals).reduce((sum, value) => sum + value, 0);
              this.logger.debug(`[seedPool] Finished ${category}: added ${totalAdded} questions`);
              return { category, addedTotals, questionIds };
            }),
          );
          for (const { category, addedTotals, questionIds } of batchResults) {
            allQuestionIds.push(...questionIds);
            for (const [difficulty, added] of Object.entries(addedTotals) as Array<[Difficulty, number]>) {
              results.push({ slot: `${category}/${difficulty}`, added });
            }
          }
        }
        completed = true;
        this.logger.debug(JSON.stringify({ event: 'seed_pool_end', questionsAdded: allQuestionIds.length }));
      } finally {
        // Always store a session record so every run appears in the admin panel,
        // even when 0 questions were added or run was cancelled/failed.
        const sessionId = await this.storeSeedPoolSession(
          allQuestionIds,
          passes,
          completed ? 'completed' : 'cancelled',
        );
        return { results, sessionId, questionIds: allQuestionIds };
      }
    };
    return force ? runSeedPool() : this.withRefillLock(runSeedPool);
  }

  @Cron('0 */2 * * *')
  async scheduledRefill(): Promise<void> {
    if (this.configService.get<string>('DISABLE_POOL_CRON') === '1') return;
    const acquired = await this.redisService.acquireLock('lock:cron:pool-refill', 600);
    if (!acquired) return;
    try {
      this.logger.debug('[cron] Proactive pool refill check');
      await this.refillIfNeeded();
    } finally {
      await this.redisService.releaseLock('lock:cron:pool-refill');
    }
  }

  /**
   * Refills pool slots that are below target. Runs in background, no-op if already refilling.
   */
  async refillIfNeeded(): Promise<void> {
    const counts = await this.getPoolCounts();

    this.logger.debug(`[refill] Pool counts (unanswered per slot): ${JSON.stringify(counts)}`);

    const needsByCategory = new Map<QuestionCategory, Partial<Record<Difficulty, number>>>();
    for (const { category, difficulty } of this.getUniqueSlots()) {
      if (category === 'NEWS') continue;
      const key = `${category}/${difficulty}`;
      const target = POOL_TARGET[key] ?? DEFAULT_POOL_TARGET;
      const current = counts[key] ?? 0;
      const needed = target - current;
      if (needed > 0) {
        const existing = needsByCategory.get(category) ?? {};
        existing[difficulty] = needed;
        needsByCategory.set(category, existing);
      }
    }

    if (needsByCategory.size === 0) {
      this.logger.debug(`[refill] All slots at or above target (${DEFAULT_POOL_TARGET}), skipping — no LLM calls`);
      return;
    }

    this.logger.debug(JSON.stringify({ event: 'pool_refill_start', categories: needsByCategory.size }));
    await this.withRefillLock(async () => {
      const sorted = [...needsByCategory.entries()].sort((a, b) => {
        const totalA = Object.values(a[1]).reduce<number>((s, value) => s + (value ?? 0), 0);
        const totalB = Object.values(b[1]).reduce<number>((s, value) => s + (value ?? 0), 0);
        return totalB - totalA;
      });

      for (const [category, needs] of sorted) {
        await this.fillCategoryUntilSatisfied(category, { ...needs });
      }
      this.logger.debug(JSON.stringify({ event: 'pool_refill_end' }));
    }).catch((err: Error) => {
      this.logger.warn(`[refillIfNeeded] ${err.message}`);
    });
  }

  /** Persists a seed-pool session record for admin dashboard inspection. Returns session id if insert succeeded. */
  private async storeSeedPoolSession(
    questionIds: string[],
    target: number,
    status: 'completed' | 'cancelled' = 'completed',
  ): Promise<string | null> {
    const { data, error } = await this.supabaseService.client
      .from('seed_pool_sessions')
      .insert({
        question_ids: questionIds,
        total_added: questionIds.length,
        target,
        status,
        generation_version: GENERATION_VERSION,
      })
      .select('id')
      .single();
    if (error) {
      this.logger.warn(`[storeSeedPoolSession] Failed to store session: ${error.message}`);
      return null;
    }
    return (data as { id: string })?.id ?? null;
  }

  private async seedCategoryPasses(
    category: BoardCategory,
    passes: number,
  ): Promise<{ addedTotals: Record<Difficulty, number>; questionIds: string[] }> {
    const addedTotals: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
    const questionIds: string[] = [];
    const existingKeys = await this.getExistingQuestionKeys(category);
    const uniqueDifficulties = [...new Set(CATEGORY_DIFFICULTY_SLOTS[category])] as Difficulty[];

    for (let pass = 0; pass < passes; pass += 1) {
      // Refresh avoid list each pass so questions added in previous passes are excluded
      const avoidQuestions = await this.getPoolSampleTexts(category);
      this.logger.debug(`[seedPool] ${category} pass ${pass + 1}/${passes}`);
      // Sequential to avoid race conditions on shared existingKeys and addedTotals
      for (const difficulty of uniqueDifficulties) {
        // eslint-disable-next-line no-await-in-loop
        await (async () => {
        let accepted: GeneratedQuestion[] = [];
        let attempt = 0;

        while (attempt <= DUPLICATE_RETRY_ATTEMPTS) {
          const plan = await this.steeringService.planBatch(category, difficulty);
          this.logSteering('seedPool', category, difficulty, plan);
          const batch = await this.questionsService.generateBatch(category, {
            questionCount: CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
            targetDifficulty: difficulty,
            avoidQuestions,
            concept: plan.concept
              ? { id: plan.concept.id, samples: plan.concept.samples }
              : undefined,
            entityTargets: plan.entityTargets,
          });
          const candidates = batch.filter(
            (q) =>
              q.difficulty === difficulty || q.allowedDifficulties?.includes(difficulty),
          );
          const validatorRejected = candidates.filter((q) => !this.questionValidator.validate(q).valid);
          let afterValidator = candidates.filter((q) => this.questionValidator.validate(q).valid);
          afterValidator = await this.filterByIntegrity(afterValidator);
          afterValidator = await this.semanticDedup(afterValidator, category);
          accepted = afterValidator.filter((q) => {
            const key = `${q.question_text}|||${q.correct_answer}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          });

          if (accepted.length > 0) break;

          if (afterValidator.length === 0 && candidates.length === 0 && batch.length > 0) {
            accepted = this.takeClosestByRawScore(batch, difficulty, existingKeys);
            if (accepted.length > 0) {
              this.logger.warn(
                `[seedPool] ${category}/${difficulty} pass ${pass + 1}: using ${accepted.length} closest-by-raw (no exact match)`,
              );
              break;
            }
          }

          const dupCount = afterValidator.length;
          const allDuplicates = validatorRejected.length === 0 && dupCount > 0;
          const reason =
            validatorRejected.length > 0
              ? `${validatorRejected.length} validator rejected, ${dupCount} duplicates`
              : dupCount > 0
                ? `all ${dupCount} duplicates (already in pool)`
                : 'no matching difficulty';

          this.logger.warn(
            `[seedPool] ${category}/${difficulty} pass ${pass + 1}: no accepted (${reason})`,
          );
          if (dupCount > 0 && afterValidator.length > 0) {
            this.logger.warn(
              `[seedPool] Sample duplicate: "${afterValidator[0].question_text?.slice(0, 60)}..." → ${afterValidator[0].correct_answer}`,
            );
          }

          if (allDuplicates && attempt < DUPLICATE_RETRY_ATTEMPTS) {
            attempt += 1;
            this.logger.debug(
              `[seedPool] ${category}/${difficulty}: retrying (attempt ${attempt}/${DUPLICATE_RETRY_ATTEMPTS})`,
            );
            await new Promise((resolve) => setTimeout(resolve, BATCH_THROTTLE_MS));
          } else {
            break;
          }
        }

        if (accepted.length > 0) {
          const difficultyOverride = accepted.some((q) => q.difficulty !== difficulty)
            ? difficulty
            : undefined;
          await this.insertQuestions(category, accepted, difficultyOverride);
          for (const q of accepted) {
            addedTotals[difficulty] += 1;
            questionIds.push(q.id);
          }
          this.logger.debug(
            `[seedPool] ${category}/${difficulty} pass ${pass + 1}: inserted ${accepted.length} question${accepted.length === 1 ? '' : 's'}`,
          );
        }

        })();
      }
    }

    // Retry: if any level unfilled, rerun targeted generation for those slots
    const missing = uniqueDifficulties.filter((d) => addedTotals[d] === 0);
    if (missing.length > 0) {
      this.logger.debug(`[seedPool] ${category}: retry for unfilled levels: ${missing.join(', ')}`);
      for (const difficulty of missing) {
        const { added, questionIds: retryIds } = await this.seedSlotPasses(category, difficulty, 1);
        addedTotals[difficulty] += added;
        questionIds.push(...retryIds);
      }
    }

    return { addedTotals, questionIds };
  }

  /**
   * Seeds a single slot using the same batch logic as seedCategoryPasses.
   * Uses generateBatch, filters to target difficulty, validates, deduplicates, inserts.
   * Runs passes until target count is reached (not batched across categories).
   */
  private async seedSlotPasses(
    category: QuestionCategory,
    difficulty: Difficulty,
    targetCount: number,
  ): Promise<{ added: number; questionIds: string[] }> {
    const existingKeys = await this.getExistingQuestionKeys(category);
    const avoidQuestions = await this.getPoolSampleTexts(category);
    const questionIds: string[] = [];
    let added = 0;
    let pass = 0;

    while (added < targetCount && pass < MAX_CATEGORY_BATCH_ATTEMPTS) {
      pass += 1;
      this.logger.debug(`[seedSlot] ${category}/${difficulty} pass ${pass}`);
      const plan = await this.steeringService.planBatch(category, difficulty);
      this.logSteering('seedSlot', category, difficulty, plan);
      const batch = await this.questionsService.generateBatch(category, {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
        targetDifficulty: difficulty,
        avoidQuestions,
        concept: plan.concept
          ? { id: plan.concept.id, samples: plan.concept.samples }
          : undefined,
        entityTargets: plan.entityTargets,
      });
      const candidates = batch.filter(
        (q) =>
          q.difficulty === difficulty ||
          q.allowedDifficulties?.includes(difficulty),
      );
      const validatorRejected: Array<{ question: string; reason: string }> = [];
      let afterValidator = candidates.filter((q) => {
        const { valid, reason } = this.questionValidator.validate(q);
        if (!valid && reason) {
          validatorRejected.push({
            question: q.question_text?.slice(0, 60) ?? '',
            reason,
          });
        }
        return valid;
      });
      afterValidator = await this.filterByIntegrity(afterValidator);
      afterValidator = await this.semanticDedup(afterValidator, category);
      if (validatorRejected.length > 0) {
        this.logger.warn(
          `[seedSlot] Validator rejected ${validatorRejected.length}: ` +
            validatorRejected.map((r) => `"${r.question}..." → ${r.reason}`).join('; '),
        );
      }
      let accepted = afterValidator
        .filter((q) => {
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        })
        .slice(0, targetCount - added);

      if (accepted.length === 0 && candidates.length === 0 && batch.length > 0) {
        const fallback = this.takeClosestByRawScore(batch, difficulty, existingKeys);
        accepted = fallback.slice(0, targetCount - added);
        if (accepted.length > 0) {
          this.logger.warn(
            `[seedSlot] ${category}/${difficulty} pass ${pass}: using ${accepted.length} closest-by-raw (no exact match)`,
          );
        }
      }

      if (accepted.length === 0) {
        const diffRej = batch.length - candidates.length;
        const valRej = candidates.length - afterValidator.length;
        const dupHint = afterValidator.length > 0 ? ', all_duplicates' : '';
        this.logger.warn(
          `[seedSlot] ${category}/${difficulty} pass ${pass}: no accepted questions ` +
            `(batch=${batch.length}, diff_mismatch=${diffRej}, validator_rej=${valRej}${dupHint})`,
        );
        continue;
      }

      const difficultyOverride = accepted.some((q) => q.difficulty !== difficulty)
        ? difficulty
        : undefined;
      await this.insertQuestions(category, accepted, difficultyOverride);
      for (const q of accepted) {
        added += 1;
        questionIds.push(q.id);
      }
      this.logger.debug(
        `[seedSlot] ${category}/${difficulty} pass ${pass}: inserted ${accepted.length} question${accepted.length === 1 ? '' : 's'} (total: ${added}/${targetCount})`,
      );
    }

    return { added, questionIds };
  }

  private async fillSlot(
    category: QuestionCategory,
    difficulty: Difficulty,
    count: number,
    baseSlotIndex = 0,
  ): Promise<string[]> {
    const candidates: GeneratedQuestion[] = [];
    for (let offset = 0; offset < count; offset += GENERATION_BATCH_SIZE) {
      const batchSize = Math.min(GENERATION_BATCH_SIZE, count - offset);
      const results = await Promise.allSettled(
        Array.from({ length: batchSize }, (_, i) =>
          this.questionsService.generateOne(category, difficulty, {
            slotIndex: baseSlotIndex + offset + i,
          }),
        ),
      );
      // Free tier: 15 RPM (Flash-Lite), 10 RPM (Flash). Throttle to stay under limit.
      if (offset + batchSize < count) {
        await new Promise((r) => setTimeout(r, BATCH_THROTTLE_MS));
      }
      const validated = results
        .filter((r): r is PromiseFulfilledResult<GeneratedQuestion> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((q) => {
          const { valid, reason } = this.questionValidator.validate(q);
          if (!valid) {
            this.logger.debug(`[fillSlot] Rejected invalid question: ${reason}`);
            return false;
          }
          return true;
        });

      const batch = await this.filterByIntegrity(validated);
      candidates.push(...batch);
    }

    if (candidates.length === 0) return [];

    // Fetch existing question keys for this category to prevent exact duplicates (same Q + same A)
    const existingKeys = await this.getExistingQuestionKeys(category);

    const filtered = candidates.filter((q) => {
      const key = `${q.question_text}|||${q.correct_answer}`;
      if (existingKeys.has(key)) {
        this.logger.debug(`[fillSlot] Skipping duplicate — LLM output: "${q.question_text}"`);
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    if (filtered.length === 0) {
      this.logger.warn(`[fillSlot] All ${candidates.length} generated questions were duplicates for ${category}/${difficulty}`);
      return [];
    }

    const semanticFiltered = await this.semanticDedup(filtered, category);
    if (semanticFiltered.length === 0) {
      this.logger.warn(`[fillSlot] All ${filtered.length} questions removed by semantic dedup for ${category}/${difficulty}`);
      return [];
    }

    try {
      await this.persistQuestionsToPool(category, semanticFiltered, difficulty);
    } catch (err) {
      this.logger.error(`[fillSlot] ${(err as Error).message}`);
      return [];
    }
    this.logger.debug(`[fillSlot] Inserted ${semanticFiltered.length}/${candidates.length} questions for ${category}/${difficulty} (${candidates.length - semanticFiltered.length} duplicates/near-dups skipped)`);
    return semanticFiltered.map((q) => q.question_text);
  }

  private async fillCategoryUntilSatisfied(
    category: QuestionCategory,
    needs: Partial<Record<Difficulty, number>>,
  ): Promise<Record<Difficulty, number>> {
    const addedTotals: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
    const existingKeys = await this.getExistingQuestionKeys(category);
    const avoidQuestions = await this.getPoolSampleTexts(category);
    let attempts = 0;

    while (this.hasRemainingNeeds(needs) && attempts < MAX_CATEGORY_BATCH_ATTEMPTS) {
      attempts += 1;
      let anyAccepted = false;

      for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
        const needed = needs[difficulty] ?? 0;
        if (needed <= 0) continue;

        const batchSize = Math.min(
          needed,
          CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
        );
        const plan = await this.steeringService.planBatch(category, difficulty);
        this.logSteering('fillCategory', category, difficulty, plan);
        const batch = await this.questionsService.generateBatch(category, {
          questionCount: batchSize,
          targetDifficulty: difficulty,
          avoidQuestions,
          concept: plan.concept
            ? { id: plan.concept.id, samples: plan.concept.samples }
            : undefined,
          entityTargets: plan.entityTargets,
        });

        const candidates = batch.filter(
          (q) =>
            q.difficulty === difficulty ||
            q.allowedDifficulties?.includes(difficulty),
        );
        let afterValidator = candidates.filter((q) => this.questionValidator.validate(q).valid);
        afterValidator = await this.filterByIntegrity(afterValidator);
        afterValidator = await this.semanticDedup(afterValidator, category);
        let accepted = afterValidator.filter((q) => {
            const key = `${q.question_text}|||${q.correct_answer}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          })
          .slice(0, needed);

        if (accepted.length === 0 && candidates.length === 0 && batch.length > 0) {
          const fallback = this.takeClosestByRawScore(batch, difficulty, existingKeys);
          accepted = fallback.slice(0, needed);
          if (accepted.length > 0) {
            this.logger.warn(
              `[fillCategory] ${category}/${difficulty}: using ${accepted.length} closest-by-raw (no exact match)`,
            );
          }
        }

        if (accepted.length > 0) {
          anyAccepted = true;
          const difficultyOverride = accepted.some((q) => q.difficulty !== difficulty)
            ? difficulty
            : undefined;
          await this.insertQuestions(category, accepted, difficultyOverride);
          for (const q of accepted) {
            const current = needs[difficulty] ?? 0;
            needs[difficulty] = Math.max(0, current - 1);
            addedTotals[difficulty] += 1;
          }
        }

        await new Promise((r) => setTimeout(r, BATCH_THROTTLE_MS));
      }
    }

    return addedTotals;
  }

  private async insertQuestions(
    category: QuestionCategory,
    questions: GeneratedQuestion[],
    difficultyOverride?: Difficulty,
  ): Promise<void> {
    await this.persistQuestionsToPool(category, questions, difficultyOverride);
  }

  /**
   * Inserts questions into the pool. No translation — pool is English-only.
   * Throws if the DB insert fails.
   *
   * @param difficultyOverride Force a specific difficulty on the row (used by seedSlot).
   *   If omitted, uses each question's own scored difficulty.
   */
  private async persistQuestionsToPool(
    category: QuestionCategory,
    questions: GeneratedQuestion[],
    difficultyOverride?: Difficulty,
  ): Promise<void> {
    if (questions.length === 0) return;

    // Last-chance embedding guard. Rows arriving here without `_embedding`
    // bypassed semanticDedup (e.g. takeClosestByRawScore fallback paths).
    // Embed them inline and run the near-duplicate check; rows that still
    // have no embedding after this are dropped rather than inserted with
    // null — a null-embedding row is invisible to every future dedup pass.
    const embeddedQuestions = await this.ensureEmbeddingsAndDedup(
      questions,
      category,
    );
    if (embeddedQuestions.length === 0) return;

    // Classify against canonical entity list. Failures degrade to null taxonomy
    // so a classifier outage never blocks pool seeding.
    const taxonomyByQuestion = await this.classifyBatch(
      embeddedQuestions,
      category,
      difficultyOverride ?? embeddedQuestions[0].difficulty,
    );

    const rows = embeddedQuestions.map((q) => {
      const difficulty = difficultyOverride ?? q.difficulty;
      let allowedDifficulties = q.allowedDifficulties ?? [difficulty];
      // When forcing a question into a slot (difficultyOverride), ensure it can be drawn for that slot.
      if (difficultyOverride && !allowedDifficulties.includes(difficultyOverride)) {
        allowedDifficulties = [...allowedDifficulties, difficultyOverride];
      }
      const tax = taxonomyByQuestion.get(q.id);
      return {
        id: q.id,
        category,
        difficulty,
        used: false,
        allowed_difficulties: allowedDifficulties,
        generation_version: GENERATION_VERSION,
        question: {
          ...q,
          difficulty,
          points: resolveQuestionPoints(q.category, difficulty),
          raw_score: undefined,
          allowedDifficulties: undefined,
          _embedding: undefined,
        },
        raw_score: q.raw_score ?? null,
        // Embedding is guaranteed by ensureEmbeddingsAndDedup above. If we
        // ever reach here without one, abort — a null-embedding row would
        // be permanently invisible to future dedup passes.
        embedding: (() => {
          const emb = (q as GeneratedQuestion & { _embedding?: number[] })._embedding;
          if (!emb) {
            throw new Error(
              `[persistQuestionsToPool] Missing embedding for "${q.question_text?.slice(0, 60)}" — aborting insert to avoid dedup blind spot`,
            );
          }
          return emb;
        })(),
        // league_tier and competition_type are auto-populated by the
        // sync_question_pool_competition_meta trigger based on competition_id.
        // era is a generated column (derived from event_year), no longer writable.
        // We still honour generator-provided overrides for league_tier /
        // competition_type if analytics_tags supplies them (COALESCE in the
        // trigger prefers non-NULL NEW values).
        league_tier: q.analytics_tags?.league_tier ?? null,
        competition_type: q.analytics_tags?.competition_type ?? null,
        event_year: q.analytics_tags?.event_year ?? tax?.event_year ?? null,
        nationality: q.analytics_tags?.nationality ?? tax?.nationality ?? null,
        // Taxonomy fields from the classifier (nullable; classifier may skip).
        subject_type: tax?.subject_type ?? null,
        subject_id: tax?.subject_id ?? null,
        subject_name: tax?.subject_name ?? null,
        competition_id: tax?.competition_id ?? null,
        question_style: tax?.question_style ?? null,
        answer_type: tax?.answer_type ?? null,
        concept_id: tax?.concept_id ?? null,
        popularity_score: tax?.popularity_score ?? null,
        time_sensitive: tax?.time_sensitive ?? false,
        valid_until: tax?.valid_until ?? null,
        // tags carries the FULL UNION: subject_id + competition_id + nationality
        // + LLM-provided secondary mentions. Single queryable bag for entity-scoped
        // modes. See migration 20260615000000.
        tags: (() => {
          const nationality = q.analytics_tags?.nationality ?? tax?.nationality ?? null;
          const union = [
            tax?.subject_id ?? null,
            tax?.competition_id ?? null,
            nationality,
            ...(tax?.tags ?? []),
          ].filter((s): s is string => typeof s === 'string' && s.length > 0);
          return union.length > 0 ? union : null;
        })(),
      };
    });

    const { error } = await this.supabaseService.client.from('question_pool').insert(rows);
    if (error) {
      throw new Error(`[persistQuestionsToPool] Insert error for ${category}: ${error.message}`);
    }
  }

  /**
   * Filters questions by factual integrity (LLM verification). Applies corrections when answer
   * is wrong but question is valid. Processes sequentially to avoid concurrent Gemini calls
   * that trigger 429 rate-limit errors.
   */
  /**
   * Strips LLM hallucination where correctedMeta is wrapped in a category-named key
   * e.g. { "PLAYER_ID": { "career": [...] } } → { "career": [...] }
   */
  private sanitizeCorrectedMeta(correctedMeta: Record<string, unknown>, category: string): Record<string, unknown> {
    const keys = Object.keys(correctedMeta);
    if (
      keys.length === 1 &&
      keys[0] === category &&
      typeof correctedMeta[category] === 'object' &&
      correctedMeta[category] !== null
    ) {
      return correctedMeta[category] as Record<string, unknown>;
    }
    return correctedMeta;
  }

  private async filterByIntegrity(questions: GeneratedQuestion[]): Promise<GeneratedQuestion[]> {
    if (!this.questionIntegrity.isEnabled || questions.length === 0) return questions;

    const passed: GeneratedQuestion[] = [];
    const rejectedReasons: string[] = [];

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const vr = await this.questionIntegrity.verify(q);

      if (!vr.valid) {
        rejectedReasons.push(vr.reason ?? 'unknown');
      } else {
        const { correctedAnswer, correctedTop5, correctedQuestionText, correctedExplanation, correctedMeta, sourceUrl } = vr;
        const sanitizedMeta = correctedMeta && Object.keys(correctedMeta).length > 0 ? this.sanitizeCorrectedMeta(correctedMeta, q.category) : correctedMeta;
        const baseMeta = sanitizedMeta && Object.keys(sanitizedMeta).length > 0 ? { ...q.meta, ...sanitizedMeta } : q.meta;
        const finalMeta = correctedTop5 && q.category === 'TOP_5' ? { ...baseMeta, top5: correctedTop5 } : baseMeta;
        const top5Desc = correctedTop5 ? correctedTop5.map((e, i) => `${i + 1}. ${e.name} (${e.stat})`).join(', ') : null;
        const hasCorrection = correctedAnswer || correctedTop5 || correctedQuestionText || correctedExplanation || correctedMeta;

        if (!hasCorrection && !sourceUrl) {
          passed.push(q);
        } else {
          let explanation = q.explanation;
          if (correctedExplanation) {
            explanation = correctedExplanation;
          } else if (top5Desc) {
            explanation = q.explanation?.replace(/^The answers were: .+$/s, `The answers were: ${top5Desc}`) ?? `The answers were: ${top5Desc}`;
          }
          const correctAnswer =
            correctedAnswer ?? (correctedTop5 && q.category === 'TOP_5' ? correctedTop5.map((e) => e.name).join(', ') : undefined);
          const hasMetaChange =
            (correctedMeta && Object.keys(correctedMeta).length > 0) || (correctedTop5 && q.category === 'TOP_5');
          passed.push({
            ...q,
            ...(correctAnswer && { correct_answer: correctAnswer }),
            ...(correctedQuestionText && { question_text: correctedQuestionText }),
            ...(explanation !== q.explanation && { explanation }),
            ...(hasMetaChange && { meta: finalMeta }),
            ...(sourceUrl && { source_url: sourceUrl }),
          });
        }
      }
    }

    if (rejectedReasons.length > 0) {
      this.logger.debug(`[fillSlot] Integrity rejected ${rejectedReasons.length}: ${rejectedReasons.join('; ')}`);
    }
    return passed;
  }

  private async semanticDedup(
    candidates: GeneratedQuestion[],
    category: QuestionCategory,
  ): Promise<GeneratedQuestion[]> {
    if (candidates.length === 0) return [];
    const texts = candidates.map((q) => q.question_text);
    // Previously swallowed errors and returned candidates unchanged, which
    // let rows insert with a null embedding — those rows became permanent
    // blind spots for every subsequent dedup check (find_near_duplicate_in_pool
    // filters `embedding IS NOT NULL`). Now we throw so the caller retries
    // the batch instead of silently corrupting the pool.
    const embeddings = await this.llmService.embedTexts(texts);

    const results: GeneratedQuestion[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const emb = embeddings[i];
      if (!emb) {
        // Individual embed failure (e.g. 429 after 3 retries). Drop this
        // item — inserting without an embedding would create a dedup blind
        // spot for every future candidate.
        this.logger.warn(
          `[semanticDedup] Dropping candidate with no embedding: "${candidates[i].question_text?.slice(0, 60)}"`,
        );
        continue;
      }
      const isDup = await this.isNearDuplicate(emb, category);
      if (isDup) {
        this.logger.debug(`[semanticDedup] Near-duplicate skipped: "${candidates[i].question_text?.slice(0, 60)}"`);
      } else {
        (candidates[i] as GeneratedQuestion & { _embedding?: number[] })._embedding = emb;
        results.push(candidates[i]);
      }
    }
    return results;
  }

  /**
   * Last-chance guard before insert: guarantees every question carries an
   * embedding AND has been checked against the existing pool for near-dupes.
   * Covers code paths that bypass `semanticDedup` (e.g. takeClosestByRawScore
   * fallbacks). Rows that already carry `_embedding` are trusted and only
   * the new ones are embedded + dedup-checked here.
   */
  private async ensureEmbeddingsAndDedup(
    questions: GeneratedQuestion[],
    category: QuestionCategory,
  ): Promise<GeneratedQuestion[]> {
    const missing: Array<{ idx: number; text: string }> = [];
    questions.forEach((q, idx) => {
      const emb = (q as GeneratedQuestion & { _embedding?: number[] })._embedding;
      if (!emb) missing.push({ idx, text: q.question_text });
    });

    if (missing.length === 0) return questions;

    this.logger.debug(
      `[persistQuestionsToPool] Embedding ${missing.length}/${questions.length} questions inline (fallback path)`,
    );

    const embeddings = await this.llmService.embedTexts(missing.map((m) => m.text));
    const dropped = new Set<number>();

    for (let i = 0; i < missing.length; i++) {
      const emb = embeddings[i];
      const { idx, text } = missing[i];
      if (!emb) {
        this.logger.warn(
          `[persistQuestionsToPool] Dropping "${text.slice(0, 60)}" — embedding failed`,
        );
        dropped.add(idx);
        continue;
      }
      if (await this.isNearDuplicate(emb, category)) {
        this.logger.debug(
          `[persistQuestionsToPool] Dropping "${text.slice(0, 60)}" — near-duplicate of existing pool row`,
        );
        dropped.add(idx);
        continue;
      }
      (questions[idx] as GeneratedQuestion & { _embedding?: number[] })._embedding = emb;
    }

    return questions.filter((_, idx) => !dropped.has(idx));
  }

  private async isNearDuplicate(embedding: number[], category: QuestionCategory): Promise<boolean> {
    const { data, error } = await this.supabaseService.client.rpc('find_near_duplicate_in_pool', {
      query_embedding: `[${embedding.join(',')}]`,
      p_category: category,
    });
    if (error) {
      this.logger.warn(`[isNearDuplicate] RPC error — ${error.message}`);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Returns a Set of "question_text|||correct_answer" keys for ALL pool rows
   * in a category (paginated, bounded at 5000 to cap memory). Previously
   * capped at 200 most-recent rows, which meant any question older than the
   * last 200 was invisible to exact-text dedup — an obvious leak once a
   * category crossed 200 rows.
   */
  private async getExistingQuestionKeys(category: QuestionCategory): Promise<Set<string>> {
    const PAGE_SIZE = 1000;
    const MAX_KEYS = 5000;
    const keys = new Set<string>();

    for (let offset = 0; offset < MAX_KEYS; offset += PAGE_SIZE) {
      const { data, error } = await this.supabaseService.client
        .from('question_pool')
        .select('question->question_text, question->correct_answer')
        .eq('category', category)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        this.logger.error(`[getExistingQuestionKeys] Query error: ${error.message}`);
        return keys;
      }

      const rows = (data ?? []) as ExistingQuestionRow[];
      for (const r of rows) {
        keys.add(`${r.question_text}|||${r.correct_answer}`);
      }
      if (rows.length < PAGE_SIZE) break;
    }

    return keys;
  }

  /**
   * Returns up to 25 randomly sampled question texts from the pool for a category.
   * Used to nudge the LLM away from topics already covered without blowing token budget.
   */
  private async getPoolSampleTexts(category: QuestionCategory, limit = 25): Promise<string[]> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('question->question_text')
      .eq('category', category)
      .limit(limit * 10) // over-fetch then shuffle client-side (avoids expensive ORDER BY RANDOM())
      .order('created_at', { ascending: false });

    if (error || !data?.length) return [];

    const texts = (data as { question_text: string }[])
      .map((r) => r.question_text)
      .filter(Boolean);

    // Fisher-Yates shuffle then slice for random sample
    for (let i = texts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [texts[i], texts[j]] = [texts[j], texts[i]];
    }
    return texts.slice(0, limit);
  }

  private async getPoolCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.supabaseService.client.rpc('get_seed_pool_stats');

    if (error) {
      this.logger.error(`[getPoolCounts] RPC error: ${error.message}`);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as PoolStatsRow[]) {
      const key = `${row.category}/${row.difficulty}`;
      counts[key] = Number(row.unanswered ?? 0);
    }
    return counts;
  }

  private getUniqueSlots(): Array<{ category: QuestionCategory; difficulty: Difficulty }> {
    const seen = new Set<string>();
    return DRAW_REQUIREMENTS.filter(({ category, difficulty }) => {
      const key = `${category}/${difficulty}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(({ category, difficulty }) => ({ category, difficulty }));
  }

  private getLiveCategories(): BoardCategory[] {
    return LIVE_CATEGORIES;
  }

  private buildNeedMapForCategory(
    category: BoardCategory,
    count: number,
  ): Partial<Record<Difficulty, number>> {
    const needs: Partial<Record<Difficulty, number>> = {};
    for (const difficulty of CATEGORY_DIFFICULTY_SLOTS[category]) {
      needs[difficulty] = (needs[difficulty] ?? 0) + count;
    }
    return needs;
  }

  /**
   * When no questions match target difficulty, take the closest by raw_score.
   * EASY: lowest raw first. HARD: highest raw first. MEDIUM: closest to band center.
   */
  private takeClosestByRawScore(
    batch: GeneratedQuestion[],
    targetDifficulty: Difficulty,
    existingKeys: Set<string>,
  ): GeneratedQuestion[] {
    const valid = batch.filter((q) => this.questionValidator.validate(q).valid);
    const nonDup = valid.filter((q) => {
      const key = `${q.question_text}|||${q.correct_answer}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    if (nonDup.length === 0) return [];
    const mid = (RAW_THRESHOLD_EASY + RAW_THRESHOLD_MEDIUM) / 2;
    const sorted =
      targetDifficulty === 'EASY'
        ? [...nonDup].sort((a, b) => (a.raw_score ?? 1) - (b.raw_score ?? 1))
        : targetDifficulty === 'HARD'
          ? [...nonDup].sort((a, b) => (b.raw_score ?? 0) - (a.raw_score ?? 0))
          : [...nonDup].sort(
              (a, b) =>
                Math.abs((a.raw_score ?? mid) - mid) - Math.abs((b.raw_score ?? mid) - mid),
            );
    return sorted;
  }

  /** Runs fn with an exclusive DB-level advisory lock, shared across all replicas. */
  private async withRefillLock<T>(fn: () => Promise<T>): Promise<T> {
    const { data: locked } = await this.supabaseService.client
      .rpc('try_advisory_lock', { lock_key: REFILL_ADVISORY_LOCK_KEY });
    if (!locked) {
      throw new Error('Pool refill already running on another instance — skipping');
    }
    try {
      return await fn();
    } finally {
      await this.supabaseService.client
        .rpc('advisory_unlock', { lock_key: REFILL_ADVISORY_LOCK_KEY });
    }
  }

  private hasRemainingNeeds(needs: Partial<Record<Difficulty, number>>): boolean {
    return (needs.EASY ?? 0) > 0 || (needs.MEDIUM ?? 0) > 0 || (needs.HARD ?? 0) > 0;
  }

  /** Emits a structured log line describing the steering plan for one batch. */
  private logSteering(
    tag: string,
    category: QuestionCategory,
    difficulty: Difficulty,
    plan: BatchSteeringPlan,
  ): void {
    const conceptPart = plan.concept
      ? `concept=${plan.concept.id}(tier=${plan.concept.tier},cov=${plan.concept.existingCoverage},samples=${plan.concept.samples.length})`
      : 'concept=none';
    const targetPart = `targets=${plan.entityTargets.length}${plan.entityTargets.length > 0 ? `[${plan.entityTargets.slice(0, 3).join('|')}${plan.entityTargets.length > 3 ? '...' : ''}]` : ''}`;
    this.logger.debug(`[${tag}] ${category}/${difficulty} steering: ${conceptPart} ${targetPart}`);
  }

  /** Fetches seed pool stats (used by seedPool minDrawable filter). */
  private async getSeedPoolStats(): Promise<SeedPoolStatsRow[]> {
    const { data, error } = await this.supabaseService.client.rpc('get_seed_pool_stats');
    if (error) throw new Error(`[getSeedPoolStats] RPC error: ${error.message}`);
    return (data ?? []) as SeedPoolStatsRow[];
  }
}
