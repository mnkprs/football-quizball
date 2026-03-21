import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionsService } from './questions.service';
import { QuestionValidator } from './validators/question.validator';
import type { GeneratedQuestion, QuestionCategory } from './question.types';
import type { Difficulty } from './config';
import { GENERATION_VERSION } from './config/generation-version.config';
import { ThresholdConfigService, type ScoreThresholds } from './threshold-config.service';

const PAGE_SIZE = 1000;

type PoolRow = {
  id: string;
  category: string;
  difficulty: string;
  raw_score?: number | null;
  allowed_difficulties?: string[] | null;
  generation_version?: string | null;
  question: GeneratedQuestion;
};

type SlotFilter = {
  category: QuestionCategory;
  difficulty?: Difficulty;
};

type RowRange = {
  start: number;
  endExclusive: number;
};

export interface MigratePoolDifficultyOptions {
  slot?: string;
  range?: string;
  apply?: boolean;
}

export interface MigratePoolDifficultyChange {
  id: string;
  question_text: string;
  change: string;
  question_version: string | null;
}

export interface MigratePoolDifficultyResult {
  scanned: number;
  updated: number;
  wouldUpdate: number;
  rejected: number;
  changes: MigratePoolDifficultyChange[];
  generationVersion: string;
  thresholds: ScoreThresholds;
}

const RAW_SCORE_EPSILON = 1e-6;

function rawScoresEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  const an = a ?? null;
  const bn = b ?? null;
  if (an === bn) return true;
  if (typeof an !== 'number' || typeof bn !== 'number') return false;
  return Math.abs(an - bn) < RAW_SCORE_EPSILON;
}

function hasRowChanged(row: PoolRow, scored: GeneratedQuestion): boolean {
  const difficultyChanged = row.difficulty !== scored.difficulty;
  const pointsChanged = row.question?.points !== scored.points;
  const rawChanged = !rawScoresEqual(row.raw_score, scored.raw_score ?? null);
  return difficultyChanged || pointsChanged || rawChanged;
}

function parseSlotFilter(raw: string | undefined): SlotFilter | null {
  if (!raw?.trim()) return null;

  const categoryMap: Record<string, QuestionCategory> = {
    HISTORY: 'HISTORY',
    PLAYER_ID: 'PLAYER_ID',
    HIGHER_OR_LOWER: 'HIGHER_OR_LOWER',
    GUESS_SCORE: 'GUESS_SCORE',
    GUESSTHESCORE: 'GUESS_SCORE',
    TOP5: 'TOP_5',
    TOP_5: 'TOP_5',
    GEOGRAPHY: 'GEOGRAPHY',
    GOSSIP: 'GOSSIP',
    NEWS: 'NEWS',
  };
  const difficultyMap: Record<string, Difficulty> = {
    EASY: 'EASY',
    MEDIUM: 'MEDIUM',
    HARD: 'HARD',
  };

  const [categoryRaw, difficultyRaw] = raw.toUpperCase().trim().split('/');
  const category = categoryMap[categoryRaw ?? ''];
  const difficulty = difficultyRaw ? difficultyMap[difficultyRaw] : undefined;

  if (!category) return null;
  if (difficultyRaw && !difficulty) return null;

  return { category, difficulty };
}

function formatChange(before: {
  difficulty: string;
  raw_score: number | null;
  allowed_difficulties: string[];
}, after: {
  difficulty: string;
  raw_score: number | null;
  allowed_difficulties: string[];
}): string {
  const parts: string[] = [];
  if (before.difficulty !== after.difficulty) {
    parts.push(`difficulty ${before.difficulty}→${after.difficulty}`);
  }
  const rawBefore = before.raw_score != null ? before.raw_score.toFixed(3) : 'null';
  const rawAfter = after.raw_score != null ? after.raw_score.toFixed(3) : 'null';
  if (rawBefore !== rawAfter) {
    parts.push(`raw_score ${rawBefore}→${rawAfter}`);
  }
  const allowedBefore = `[${(before.allowed_difficulties ?? []).join(',')}]`;
  const allowedAfter = `[${(after.allowed_difficulties ?? []).join(',')}]`;
  if (allowedBefore !== allowedAfter) {
    parts.push(`allowed_difficulties ${allowedBefore}→${allowedAfter}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no change';
}

function parseRowRange(raw: string | undefined): RowRange | null {
  if (!raw?.trim()) return null;

  const match = raw.trim().match(/^(\d+)-(\d+)$/);
  if (!match) return null;

  const start = Number.parseInt(match[1], 10);
  const endExclusive = Number.parseInt(match[2], 10);
  if (endExclusive <= start) return null;

  return { start, endExclusive };
}

@Injectable()
export class MigratePoolDifficultyService {
  private readonly logger = new Logger(MigratePoolDifficultyService.name);

  constructor(
    private supabase: SupabaseService,
    private questionsService: QuestionsService,
    private questionValidator: QuestionValidator,
    private thresholdConfig: ThresholdConfigService,
  ) {}

  async migrate(options: MigratePoolDifficultyOptions = {}): Promise<MigratePoolDifficultyResult> {
    const { slot, range, apply = false } = options;
    const slotFilter = parseSlotFilter(slot);
    const rowRange = parseRowRange(range);

    const rows = await this.fetchRows(slotFilter, rowRange);
    const { rejectedIds, updates } = this.collectUpdates(rows);

    if (apply && updates.length > 0) {
      await this.applyUpdates(updates);
    }

    const rowById = new Map(rows.map((r) => [r.id, r]));
    const changes: MigratePoolDifficultyChange[] = updates.map((u) => ({
      id: u.id,
      question_text: u.question.question_text ?? '',
      change: formatChange(u.before, {
        difficulty: u.difficulty,
        raw_score: u.raw_score,
        allowed_difficulties: u.allowed_difficulties,
      }),
      question_version: rowById.get(u.id)?.generation_version ?? null,
    }));

    this.logger.log(
      `[migrate-pool-difficulty] scanned=${rows.length} updates=${updates.length} rejected=${rejectedIds.length} apply=${apply}`,
    );

    return {
      scanned: rows.length,
      updated: apply ? updates.length : 0,
      wouldUpdate: updates.length,
      rejected: rejectedIds.length,
      changes,
      generationVersion: GENERATION_VERSION,
      thresholds: this.thresholdConfig.getThresholds(),
    };
  }

  private buildRowQuery(slotFilter: SlotFilter | null) {
    let query = this.supabase.client
      .from('question_pool')
      .select('id, category, difficulty, raw_score, allowed_difficulties, generation_version, question')
      .order('id', { ascending: true });

    if (slotFilter?.category) {
      query = query.eq('category', slotFilter.category);
    }
    if (slotFilter?.difficulty) {
      query = query.eq('difficulty', slotFilter.difficulty);
    }

    return query;
  }

  private async fetchRows(
    slotFilter: SlotFilter | null,
    rowRange: RowRange | null,
  ): Promise<PoolRow[]> {
    const rows: PoolRow[] = [];
    const rangeStart = rowRange?.start ?? 0;
    const rangeEndExclusive = rowRange?.endExclusive;

    for (let offset = rangeStart; ; offset += PAGE_SIZE) {
      const pageEndExclusive = rangeEndExclusive
        ? Math.min(offset + PAGE_SIZE, rangeEndExclusive)
        : offset + PAGE_SIZE;
      if (pageEndExclusive <= offset) break;

      const query = this.buildRowQuery(slotFilter);
      const { data, error } = await query.range(offset, pageEndExclusive - 1);
      if (error) {
        throw new Error(`question_pool fetch error at offset ${offset}: ${error.message}`);
      }

      const batch = (data ?? []) as PoolRow[];
      rows.push(...batch);
      if (
        batch.length < PAGE_SIZE ||
        (rangeEndExclusive !== undefined && pageEndExclusive >= rangeEndExclusive)
      ) {
        break;
      }
    }

    return rows;
  }

  private collectUpdates(
    rows: PoolRow[],
  ): {
    rejectedIds: string[];
    updates: Array<{
      id: string;
      difficulty: string;
      allowed_difficulties: string[];
      raw_score: number | null;
      question: GeneratedQuestion;
      before: { difficulty: string; raw_score: number | null; allowed_difficulties: string[] };
    }>;
  } {
    const rejectedIds: string[] = [];
    const updates: Array<{
      id: string;
      difficulty: string;
      allowed_difficulties: string[];
      raw_score: number | null;
      question: GeneratedQuestion;
      before: { difficulty: string; raw_score: number | null; allowed_difficulties: string[] };
    }> = [];

    for (const row of rows) {
      const { scored, rejectReason } = this.questionsService.scoreQuestionWithDetails(
        row.question,
        { categoryOverride: row.category as QuestionCategory },
      );

      if (!scored) {
        rejectedIds.push(row.id);
        continue;
      }

      if (!hasRowChanged(row, scored)) continue;
      const { raw_score, allowedDifficulties, ...questionWithoutRaw } = scored;
      const safeRaw =
        typeof raw_score === 'number' && Number.isFinite(raw_score) ? raw_score : null;
      const allowed = allowedDifficulties ?? [scored.difficulty];
      const beforeAllowed = row.allowed_difficulties ?? (row.difficulty ? [row.difficulty] : []);
      updates.push({
        id: row.id,
        difficulty: scored.difficulty,
        allowed_difficulties: allowed,
        raw_score: safeRaw,
        question: questionWithoutRaw,
        before: {
          difficulty: row.difficulty,
          raw_score: row.raw_score ?? null,
          allowed_difficulties: beforeAllowed,
        },
      });
    }

    return { rejectedIds, updates };
  }

  private async applyUpdates(
    updates: Array<{
      id: string;
      difficulty: string;
      allowed_difficulties: string[];
      raw_score: number | null;
      question: GeneratedQuestion;
    }>,
  ): Promise<void> {
    for (const update of updates) {
      const { error } = await this.supabase.client
        .from('question_pool')
        .update({
          difficulty: update.difficulty,
          allowed_difficulties: update.allowed_difficulties,
          raw_score: update.raw_score,
          question: update.question,
        })
        .eq('id', update.id);

      if (error) {
        this.logger.error(`[migrate-pool-difficulty] Update failed for ${update.id}: ${error.message}`);
      }
    }
  }
}
