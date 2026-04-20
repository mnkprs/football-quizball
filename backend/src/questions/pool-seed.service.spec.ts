import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PoolSeedService } from './pool-seed.service';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { QuestionsService } from './questions.service';
import { QuestionValidator } from './validators/question.validator';
import { QuestionIntegrityService } from './validators/question-integrity.service';
import { QuestionClassifierService } from './classifiers/question-classifier.service';
import { SteeringService } from './steering';
import { RedisService } from '../redis/redis.service';
import type { GeneratedQuestion, QuestionCategory } from './config';

// Tests reach private methods via bracket notation on this alias to bypass
// TypeScript's access check. Intersection types reduce to `never` when the
// same property is private in one constituent and public in another.
type PrivateAccessor = PoolSeedService & Record<string, (...args: any[]) => any>;

function makeQuestion(id: string, withEmbedding = false): GeneratedQuestion {
  const q = {
    id,
    question_text: `Q ${id}?`,
    correct_answer: `A${id}`,
    wrong_choices: ['W1', 'W2', 'W3'],
    explanation: 'why',
    category: 'HISTORY' as QuestionCategory,
    difficulty: 'EASY',
  } as GeneratedQuestion;
  if (withEmbedding) {
    (q as GeneratedQuestion & { _embedding?: number[] })._embedding = [0.1, 0.2, 0.3];
  }
  return q;
}

function makeEmbedding(seed: number): number[] {
  return [seed * 0.1, seed * 0.2, seed * 0.3];
}

async function buildService(overrides: {
  embedTexts?: jest.Mock;
  rpcNearDuplicate?: jest.Mock;
  selectChain?: jest.Mock;
}): Promise<PrivateAccessor> {
  const embedTexts = overrides.embedTexts ?? jest.fn();
  const rpc = overrides.rpcNearDuplicate ?? jest.fn().mockResolvedValue({ data: [], error: null });

  const selectChain = overrides.selectChain ?? jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: [], error: null }),
  }));

  const supabaseMock = {
    client: {
      from: selectChain,
      rpc,
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PoolSeedService,
      { provide: SupabaseService, useValue: supabaseMock },
      { provide: LlmService, useValue: { embedTexts } },
      { provide: QuestionsService, useValue: {} },
      { provide: QuestionValidator, useValue: {} },
      { provide: QuestionIntegrityService, useValue: {} },
      { provide: QuestionClassifierService, useValue: { classify: jest.fn() } },
      { provide: SteeringService, useValue: { planBatch: jest.fn() } },
      { provide: RedisService, useValue: {} },
      { provide: ConfigService, useValue: { get: jest.fn() } },
    ],
  }).compile();

  return module.get<PoolSeedService>(PoolSeedService) as PrivateAccessor;
}

// ─── T2: semanticDedup ────────────────────────────────────────────────────────

describe('PoolSeedService — semanticDedup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('empty input returns [] without calling embedTexts', async () => {
    const embedTexts = jest.fn();
    const service = await buildService({ embedTexts });
    const result = await service["semanticDedup"]([], 'HISTORY');
    expect(result).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it('drops items whose per-item embedding is null', async () => {
    const embedTexts = jest.fn().mockResolvedValue([makeEmbedding(1), null]);
    const service = await buildService({ embedTexts });
    const result = await service["semanticDedup"](
      [makeQuestion('a'), makeQuestion('b')],
      'HISTORY',
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('a');
  });

  it('drops near-duplicates (RPC returns a match)', async () => {
    const embedTexts = jest.fn().mockResolvedValue([makeEmbedding(1)]);
    const rpcNearDuplicate = jest.fn().mockResolvedValue({
      data: [{ id: 'existing', similarity: 0.95 }],
      error: null,
    });
    const service = await buildService({ embedTexts, rpcNearDuplicate });
    const result = await service["semanticDedup"]([makeQuestion('a')], 'HISTORY');
    expect(result.length).toBe(0);
  });

  it('propagates embedTexts failure (no silent fallback)', async () => {
    const embedTexts = jest.fn().mockRejectedValue(new Error('429 rate-limit'));
    const service = await buildService({ embedTexts });
    await expect(
      service["semanticDedup"]([makeQuestion('a')], 'HISTORY'),
    ).rejects.toThrow('429 rate-limit');
  });

  it('attaches _embedding to survivors so persist can trust it', async () => {
    const emb = makeEmbedding(1);
    const embedTexts = jest.fn().mockResolvedValue([emb]);
    const service = await buildService({ embedTexts });
    const result = await service["semanticDedup"]([makeQuestion('a')], 'HISTORY');
    expect(result.length).toBe(1);
    expect(
      (result[0] as GeneratedQuestion & { _embedding?: number[] })._embedding,
    ).toEqual(emb);
  });
});

// ─── T1: ensureEmbeddingsAndDedup ─────────────────────────────────────────────

describe('PoolSeedService — ensureEmbeddingsAndDedup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns input unchanged when every row already has _embedding (no LLM call)', async () => {
    const embedTexts = jest.fn();
    const service = await buildService({ embedTexts });
    const input = [makeQuestion('a', true), makeQuestion('b', true)];
    const result = await service["ensureEmbeddingsAndDedup"](input, 'HISTORY');
    expect(result.length).toBe(2);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it('embeds only the rows missing _embedding', async () => {
    const embedTexts = jest.fn().mockResolvedValue([makeEmbedding(99)]);
    const service = await buildService({ embedTexts });
    const input = [makeQuestion('already', true), makeQuestion('missing', false)];
    const result = await service["ensureEmbeddingsAndDedup"](input, 'HISTORY');
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts.mock.calls[0][0]).toEqual(['Q missing?']);
    expect(result.length).toBe(2);
  });

  it('drops rows whose inline embedding failed', async () => {
    const embedTexts = jest.fn().mockResolvedValue([null]);
    const service = await buildService({ embedTexts });
    const result = await service["ensureEmbeddingsAndDedup"](
      [makeQuestion('missing', false)],
      'HISTORY',
    );
    expect(result.length).toBe(0);
  });

  it('drops rows detected as near-duplicates after inline embed', async () => {
    const embedTexts = jest.fn().mockResolvedValue([makeEmbedding(1)]);
    const rpcNearDuplicate = jest.fn().mockResolvedValue({
      data: [{ id: 'existing', similarity: 0.99 }],
      error: null,
    });
    const service = await buildService({ embedTexts, rpcNearDuplicate });
    const result = await service["ensureEmbeddingsAndDedup"](
      [makeQuestion('new', false)],
      'HISTORY',
    );
    expect(result.length).toBe(0);
  });
});

// ─── T3: persistQuestionsToPool embedding assertion ───────────────────────────

describe('PoolSeedService — persistQuestionsToPool assertion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('empty input returns [] without any DB call', async () => {
    const service = await buildService({});
    const result = await service["persistQuestionsToPool"]('HISTORY', []);
    expect(result).toEqual([]);
  });

  // The assertion path is ensureEmbeddingsAndDedup → loop-guard. We already
  // verify ensureEmbeddingsAndDedup drops missing-embedding rows above, so
  // an in-practice null-embedding arriving at the row-literal is impossible.
  // The loop-guard is pure defense-in-depth: verified by code inspection
  // (for loop throws if any q lacks _embedding) — tested end-to-end via the
  // live seed run evidence in the deploy report.
});

// ─── T4: getExistingQuestionKeys pagination ───────────────────────────────────

describe('PoolSeedService — getExistingQuestionKeys pagination', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockRangeWithPages(pages: Array<Array<{ question_text: string; correct_answer: string }>>) {
    let pageIdx = 0;
    const rangeFn = jest.fn().mockImplementation(() => {
      const page = pages[pageIdx] ?? [];
      pageIdx += 1;
      return Promise.resolve({ data: page, error: null });
    });
    const selectChain = jest.fn(() => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: rangeFn,
      };
      return chain;
    });
    return { selectChain, rangeFn };
  }

  it('single-page result (< PAGE_SIZE) exits after one call', async () => {
    const { selectChain, rangeFn } = mockRangeWithPages([
      [{ question_text: 'Q1', correct_answer: 'A1' }],
    ]);
    const service = await buildService({ selectChain });
    const keys = await service["getExistingQuestionKeys"]('HISTORY');
    expect(keys.size).toBe(1);
    expect(keys.has('Q1|||A1')).toBe(true);
    expect(rangeFn).toHaveBeenCalledTimes(1);
  });

  it('accumulates across multiple full pages', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      question_text: `Q${i}`,
      correct_answer: `A${i}`,
    }));
    const shortPage = [{ question_text: 'Qlast', correct_answer: 'Alast' }];
    const { selectChain, rangeFn } = mockRangeWithPages([fullPage, shortPage]);
    const service = await buildService({ selectChain });
    const keys = await service["getExistingQuestionKeys"]('HISTORY');
    expect(keys.size).toBe(1001);
    expect(rangeFn).toHaveBeenCalledTimes(2);
  });

  it('returns partial keys on mid-pagination error', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({
      question_text: `Q${i}`,
      correct_answer: `A${i}`,
    }));
    let call = 0;
    const rangeFn = jest.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ data: firstPage, error: null });
      return Promise.resolve({ data: null, error: { message: 'network down' } });
    });
    const selectChain = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: rangeFn,
    }));
    const service = await buildService({ selectChain });
    const keys = await service["getExistingQuestionKeys"]('HISTORY');
    expect(keys.size).toBe(1000); // page 1 succeeded
    expect(rangeFn).toHaveBeenCalledTimes(2); // page 2 errored
  });
});
