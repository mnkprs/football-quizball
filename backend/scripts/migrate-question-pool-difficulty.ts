#!/usr/bin/env npx ts-node
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { QuestionsService } from '../src/questions/questions.service';
import { QuestionValidator } from '../src/questions/validators/question.validator';
import {
  Difficulty,
  GeneratedQuestion,
  QuestionCategory,
  QuestionLocale,
} from '../src/questions/question.types';

const PAGE_SIZE = 1000;
const UPDATE_LOG_EVERY = 250;
const VERBOSE_QUESTION_MAX_LEN = 60;

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  boldWhite: '\x1b[1;37m',
} as const;

const RAW_BAND_COLORS = {
  UNKNOWN: ANSI.magenta,
  EASY: ANSI.green,
  MEDIUM: ANSI.yellow,
  HARD: ANSI.red,
} as const;

type PoolRow = {
  id: string;
  category: string;
  difficulty: string;
  raw_score?: number | null;
  allowed_difficulties?: string[] | null;
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

function getArgValue(flag: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return match?.split('=').slice(1).join('=');
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseSlotFilter(raw: string | undefined): SlotFilter | null {
  if (!raw) return null;

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

  const [categoryRaw, difficultyRaw] = raw.toUpperCase().split('/');
  const category = categoryMap[categoryRaw];
  const difficulty = difficultyRaw ? difficultyMap[difficultyRaw] : undefined;

  if (!category) {
    throw new Error(`Invalid --slot value: ${raw}`);
  }
  if (difficultyRaw && !difficulty) {
    throw new Error(`Invalid difficulty in --slot value: ${raw}`);
  }

  return { category, difficulty };
}

function parseRowRange(raw: string | undefined): RowRange | null {
  if (!raw) return null;

  const match = raw.match(/^(\d+)-(\d+)$/);
  if (!match) {
    throw new Error(`Invalid --range value: ${raw}. Expected start-end, e.g. 0-250`);
  }

  const start = Number.parseInt(match[1], 10);
  const endExclusive = Number.parseInt(match[2], 10);
  if (endExclusive <= start) {
    throw new Error(`Invalid --range value: ${raw}. End must be greater than start`);
  }

  return { start, endExclusive };
}

function colorize(text: string, color: string): string {
  return `${color}${text}${ANSI.reset}`;
}

function getRawBand(raw: number | null | undefined): 'EASY' | 'MEDIUM' | 'HARD' | 'UNKNOWN' {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 'UNKNOWN';
  return raw >= 0.48 ? 'HARD' : raw >= 0.30 ? 'MEDIUM' : 'EASY';
}

function shouldLogRawBandChange(
  rawBefore: number | null | undefined,
  rawAfter: number | null | undefined,
): boolean {
  return getRawBand(rawBefore) !== getRawBand(rawAfter);
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
  const pointsChanged = row.question.points !== scored.points;
  const rawChanged = !rawScoresEqual(row.raw_score, scored.raw_score ?? null);
  return difficultyChanged || pointsChanged || rawChanged;
}

function logRowIfBandChanged(
  questionText: string,
  rawBefore: number | null | undefined,
  rawAfter: number | null | undefined,
): void {
  if (!shouldLogRawBandChange(rawBefore, rawAfter)) {
    return;
  }

  console.log(
    `${colorize('[migrate]', ANSI.boldWhite)} ${colorize(`"${questionText}"`, ANSI.boldWhite)} ${colorize('raw_before=', ANSI.dim)}${formatColoredRaw(rawBefore)} ${colorize('raw_after=', ANSI.dim)}${formatColoredRaw(rawAfter)}`,
  );
}

function formatColoredRaw(raw: number | null | undefined): string {
  const band = getRawBand(raw);
  const text = band === 'UNKNOWN' ? 'n/a' : (raw as number).toFixed(2);
  return colorize(text, RAW_BAND_COLORS[band]);
}

function formatSlotFilter(slotFilter: SlotFilter | null): string {
  if (!slotFilter) return 'all';
  return `${slotFilter.category}${slotFilter.difficulty ? `/${slotFilter.difficulty}` : ''}`;
}

function formatRowRange(rowRange: RowRange | null): string {
  if (!rowRange) return 'all';
  return `${rowRange.start}-${rowRange.endExclusive}`;
}

function buildRowQuery(
  supabase: SupabaseService,
  slotFilter: SlotFilter | null,
) {
  let query = supabase.client
    .from('question_pool')
    .select('id, category, difficulty, raw_score, allowed_difficulties, question')
    .order('id', { ascending: true });

  if (slotFilter?.category) {
    query = query.eq('category', slotFilter.category);
  }
  if (slotFilter?.difficulty) {
    query = query.eq('difficulty', slotFilter.difficulty);
  }

  return query;
}

function shouldStopFetching(
  batchLength: number,
  pageEndExclusive: number,
  rangeEndExclusive: number | undefined,
): boolean {
  if (rangeEndExclusive !== undefined) {
    return pageEndExclusive >= rangeEndExclusive;
  }
  return batchLength < PAGE_SIZE;
}

async function fetchRows(
  supabase: SupabaseService,
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
    if (pageEndExclusive <= offset) {
      break;
    }

    const query = buildRowQuery(supabase, slotFilter);
    const { data, error } = await query.range(offset, pageEndExclusive - 1);
    if (error) {
      throw new Error(`question_pool fetch error at offset ${offset}: ${error.message}`);
    }

    const batch = (data ?? []) as PoolRow[];
    rows.push(...batch);
    if (shouldStopFetching(batch.length, pageEndExclusive, rangeEndExclusive)) {
      break;
    }
  }

  return rows;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}

type UpdateEntry = {
  id: string;
  difficulty: string;
  allowed_difficulties: string[];
  raw_score: number | null;
  question: GeneratedQuestion;
  /** Before state for dry-run output */
  before: { difficulty: string; raw_score: number | null; allowed_difficulties: string[] };
};

function formatChange(update: UpdateEntry): string {
  const b = update.before;
  const parts: string[] = [];
  if (b.difficulty !== update.difficulty) {
    parts.push(`difficulty ${b.difficulty}→${update.difficulty}`);
  }
  const rawBefore = b.raw_score != null ? b.raw_score.toFixed(3) : 'null';
  const rawAfter = update.raw_score != null ? update.raw_score.toFixed(3) : 'null';
  if (rawBefore !== rawAfter) {
    parts.push(`raw_score ${rawBefore}→${rawAfter}`);
  }
  const allowedBefore = `[${(b.allowed_difficulties ?? []).join(',')}]`;
  const allowedAfter = `[${(update.allowed_difficulties ?? []).join(',')}]`;
  if (allowedBefore !== allowedAfter) {
    parts.push(`allowed_difficulties ${allowedBefore}→${allowedAfter}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no change';
}

function collectUpdates(
  rows: PoolRow[],
  questionsService: QuestionsService,
  questionValidator: QuestionValidator,
  locale: QuestionLocale,
  verbose: boolean,
): {
  rejectedIds: string[];
  updates: UpdateEntry[];
} {
  const rejectedIds: string[] = [];
  const updates: UpdateEntry[] = [];

  for (const row of rows) {
    const { scored, rejectReason } = questionsService.scoreQuestionWithDetails(
      row.question,
      locale,
      { categoryOverride: row.category as QuestionCategory },
    );

    if (verbose) {
      const qPreview = truncate(row.question.question_text ?? '', VERBOSE_QUESTION_MAX_LEN);
      const idShort = row.id.slice(0, 8);
      if (!scored) {
        const validation = questionValidator.validate(row.question);
        const extra =
          validation.valid ? '' : ` | validation: ${validation.reason}`;
        console.log(
          `${colorize('[REJECTED]', ANSI.red)} ${idShort} "${qPreview}" reason=${rejectReason ?? 'unknown'}${extra}`,
        );
      } else {
        const changed = hasRowChanged(row, scored);
        const rawBefore = row.raw_score ?? null;
        const rawAfter = scored.raw_score ?? null;
        if (!changed) {
          console.log(
            `${colorize('[SKIPPED]', ANSI.yellow)} ${idShort} "${qPreview}" raw=${formatColoredRaw(rawBefore)}→${formatColoredRaw(rawAfter)} (no change)`,
          );
        } else {
          console.log(
            `${colorize('[UPDATE]', ANSI.green)} ${idShort} "${qPreview}" raw=${formatColoredRaw(rawBefore)}→${formatColoredRaw(rawAfter)}`,
          );
        }
      }
    }

    if (!scored) {
      rejectedIds.push(row.id);
      continue;
    }

    if (!hasRowChanged(row, scored)) {
      continue;
    }

    const { raw_score, allowedDifficulties, ...questionWithoutRaw } = scored;
    if (!verbose) {
      logRowIfBandChanged(row.question.question_text, row.raw_score, raw_score ?? null);
    }
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

async function applyUpdates(supabase: SupabaseService, updates: UpdateEntry[]): Promise<void> {
  let processed = 0;

  for (const update of updates) {
    const { error: updateError } = await supabase.client
      .from('question_pool')
      .update({
        difficulty: update.difficulty,
        allowed_difficulties: update.allowed_difficulties,
        raw_score: update.raw_score,
        question: update.question,
      })
      .eq('id', update.id);
    if (updateError) {
      console.error(`Update failed for ${update.id}: ${updateError.message}`);
    }
    processed += 1;
    if (processed % UPDATE_LOG_EVERY === 0 || processed === updates.length) {
      console.log(`Processed ${processed}/${updates.length} updates...`);
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const verbose = hasFlag('--verbose');
  const locale = (getArgValue('--locale') ?? 'el') as QuestionLocale;
  const slotFilter = parseSlotFilter(getArgValue('--slot'));
  const rowRange = parseRowRange(getArgValue('--range'));

  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);
  const questionsService = app.get(QuestionsService);
  const questionValidator = app.get(QuestionValidator);

  const rows = await fetchRows(supabase, slotFilter, rowRange);
  if (verbose) {
    console.log(`${colorize('[verbose]', ANSI.boldWhite)} Processing ${rows.length} rows...\n`);
  }
  const { rejectedIds, updates } = collectUpdates(
    rows,
    questionsService,
    questionValidator,
    locale,
    verbose,
  );

  if (verbose) {
    console.log('');
  }
  console.log(
    `Scanned ${rows.length} question_pool rows (locale=${locale}, apply=${apply}, slot=${formatSlotFilter(slotFilter)}, range=${formatRowRange(rowRange)})`,
  );
  console.log(`Rows to update: ${updates.length}`);
  console.log(`Rows rejected by new rules (kept untouched): ${rejectedIds.length}`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write updates.');
    if (updates.length > 0) {
      console.log('');
      console.log(`${colorize('Would update:', ANSI.boldWhite)}`);
      for (const u of updates) {
        console.log(`  ${u.id}  ${formatChange(u)}`);
      }
    }
    if (rejectedIds.length > 0) {
      console.log('');
      console.log(`Sample rejected ids: ${rejectedIds.slice(0, 20).join(', ')}`);
    }
    await app.close();
    return;
  }

  await applyUpdates(supabase, updates);
  if (rejectedIds.length > 0) {
    console.log(`Left ${rejectedIds.length} rejected rows unchanged.`);
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
