import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { QuestionPoolService } from './question-pool.service';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { QuestionsService } from './questions.service';
import { QuestionValidator } from './validators/question.validator';
import { QuestionIntegrityService } from './validators/question-integrity.service';
import { SOLO_DRAW_CATEGORY_ORDER, DUEL_CATEGORIES } from './config/category.config';
import type { GeneratedQuestion, QuestionCategory, Difficulty } from './config';

// ─── Helper: build a minimal GeneratedQuestion ───────────────────────────────

function makeQuestion(id: string, category: QuestionCategory = 'HISTORY', difficulty: Difficulty = 'EASY'): GeneratedQuestion {
  return {
    id,
    question_text: `Q ${id}?`,
    correct_answer: `A${id}`,
    wrong_choices: ['W1', 'W2', 'W3'],
    explanation: 'Explanation.',
    category,
    difficulty,
  } as GeneratedQuestion;
}

// ─── Helper: Supabase mock that mimics the draw_board RPC ────────────────────

function buildSupabaseMock() {
  return {
    client: {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    },
  };
}

// ─── Build NestJS testing module ─────────────────────────────────────────────

async function buildService(
  supabase: object,
  generateCategoryFallback?: jest.Mock,
  drawSlot?: jest.Mock,
): Promise<QuestionPoolService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuestionPoolService,
      { provide: SupabaseService, useValue: supabase },
      { provide: LlmService, useValue: {} },
      { provide: QuestionsService, useValue: { generateForCategory: jest.fn() } },
      { provide: QuestionValidator, useValue: { validate: jest.fn().mockReturnValue({ valid: true }) } },
      { provide: QuestionIntegrityService, useValue: { isEnabled: false } },
    ],
  }).compile();

  const service = module.get<QuestionPoolService>(QuestionPoolService);

  if (generateCategoryFallback) {
    jest.spyOn(service as any, 'generateCategoryFallback').mockImplementation(generateCategoryFallback);
  }
  if (drawSlot) {
    jest.spyOn(service as any, 'drawSlot').mockImplementation(drawSlot);
  }

  return service;
}

// ─── drawBoard — language routing ────────────────────────────────────────────

describe('QuestionPoolService — drawBoard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bypasses pool and generates live for non-English language', async () => {
    const liveQ = makeQuestion('live1');
    const generateCategoryFallback = jest.fn().mockResolvedValue([liveQ]);

    const service = await buildService(buildSupabaseMock(), generateCategoryFallback);

    const result = await service.drawBoard('el');

    expect(generateCategoryFallback).toHaveBeenCalled();
    expect(result.poolQuestionIds).toEqual([]);
    expect(result.questions.length).toBeGreaterThan(0);
  });

  it('uses pool for English and returns poolQuestionIds', async () => {
    const poolQ = makeQuestion('pool1');
    const supabase = buildSupabaseMock();
    // drawBoardFromDb is called internally; mock it directly
    const service = await buildService(supabase);
    jest.spyOn(service as any, 'drawBoardFromDb').mockResolvedValue({
      questions: [poolQ],
      poolIds: ['pool1'],
      missingByCategory: new Map(),
    });

    const result = await service.drawBoard('en');

    expect(result.poolQuestionIds).toContain('pool1');
    expect(result.questions).toContainEqual(poolQ);
  });

  it('throws ServiceUnavailableException when pool missing and LLM fallback disabled', async () => {
    const service = await buildService(buildSupabaseMock());
    jest.spyOn(service as any, 'drawBoardFromDb').mockResolvedValue({
      questions: [],
      poolIds: [],
      missingByCategory: new Map([['HISTORY', ['EASY']]]),
    });
    jest.spyOn(service as any, 'generateCategoryFallback').mockResolvedValue([]);

    await expect(service.drawBoard('en', undefined, false)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

// ─── drawOneForSolo — category order ─────────────────────────────────────────

describe('QuestionPoolService — drawOneForSolo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns first question from the first category that has one', async () => {
    const question = makeQuestion('s1', SOLO_DRAW_CATEGORY_ORDER[0], 'EASY');
    const drawSlot = jest.fn().mockResolvedValueOnce([question]).mockResolvedValue([]);

    const service = await buildService(buildSupabaseMock(), undefined, drawSlot);
    const result = await service.drawOneForSolo('EASY');

    expect(result).toEqual(question);
    expect(drawSlot).toHaveBeenCalledWith(SOLO_DRAW_CATEGORY_ORDER[0], 'EASY', 1, 'en', undefined);
  });

  it('tries next category when first is empty', async () => {
    const question = makeQuestion('s2', SOLO_DRAW_CATEGORY_ORDER[1], 'MEDIUM');
    const drawSlot = jest
      .fn()
      .mockResolvedValueOnce([]) // first category: empty
      .mockResolvedValueOnce([question]); // second category: has one

    const service = await buildService(buildSupabaseMock(), undefined, drawSlot);
    const result = await service.drawOneForSolo('MEDIUM');

    expect(result).toEqual(question);
    expect(drawSlot).toHaveBeenCalledTimes(2);
    expect(drawSlot).toHaveBeenNthCalledWith(1, SOLO_DRAW_CATEGORY_ORDER[0], 'MEDIUM', 1, 'en', undefined);
    expect(drawSlot).toHaveBeenNthCalledWith(2, SOLO_DRAW_CATEGORY_ORDER[1], 'MEDIUM', 1, 'en', undefined);
  });

  it('returns null when all categories are empty', async () => {
    const drawSlot = jest.fn().mockResolvedValue([]);
    const service = await buildService(buildSupabaseMock(), undefined, drawSlot);
    const result = await service.drawOneForSolo('HARD');

    expect(result).toBeNull();
    expect(drawSlot).toHaveBeenCalledTimes(SOLO_DRAW_CATEGORY_ORDER.length);
  });

  it('passes excludeIds to drawSlot', async () => {
    const drawSlot = jest.fn().mockResolvedValue([]);
    const service = await buildService(buildSupabaseMock(), undefined, drawSlot);
    await service.drawOneForSolo('EASY', 'en', ['id1', 'id2']);

    expect(drawSlot).toHaveBeenCalledWith(expect.any(String), 'EASY', 1, 'en', ['id1', 'id2']);
  });
});

// ─── drawForDuel — distribution and exclusion ─────────────────────────────────

describe('QuestionPoolService — drawForDuel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns up to n questions round-robin across DUEL_CATEGORIES', async () => {
    let callIndex = 0;
    const drawSlot = jest.fn().mockImplementation((cat: string, diff: string) => {
      return Promise.resolve([makeQuestion(`q${callIndex++}`, cat as QuestionCategory, diff as Difficulty)]);
    });

    const service = await buildService(buildSupabaseMock(), undefined, drawSlot);
    const n = DUEL_CATEGORIES.length; // one full rotation
    const result = await service.drawForDuel('en', n);

    expect(result).toHaveLength(n);
    // First n calls should cover each DUEL_CATEGORY once
    const calledCategories = (drawSlot.mock.calls as [string, string][]).slice(0, n).map(([cat]) => cat);
    for (const cat of DUEL_CATEGORIES) {
      expect(calledCategories).toContain(cat);
    }
  });

  it('excludes question IDs already drawn in the same call', async () => {
    let callIndex = 0;
    const drawSlot = jest.fn().mockImplementation((cat: string, diff: string, count: number, lang: string, excludeIds?: string[]) => {
      const id = `q${callIndex++}`;
      if (excludeIds?.includes(id)) return Promise.resolve([]);
      return Promise.resolve([makeQuestion(id, cat as QuestionCategory, diff as Difficulty)]);
    });

    const service = await buildService(buildSupabaseMock(), undefined, drawSlot);
    const result = await service.drawForDuel('en', 5);

    // All IDs in result must be unique
    const ids = result.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('passes excludeIds from caller into drawSlot on first batch', async () => {
    const preExcluded = ['existing1'];
    const drawSlot = jest.fn().mockResolvedValue([]);

    const service = await buildService(buildSupabaseMock(), undefined, drawSlot);
    await service.drawForDuel('en', 5, preExcluded);

    // At least one call should have included the pre-excluded ID
    const firstCallExclude = (drawSlot.mock.calls as [string, string, number, string, string[] | undefined][])[0][4];
    expect(firstCallExclude).toContain('existing1');
  });
});
