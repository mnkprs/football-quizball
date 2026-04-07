import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { QuestionPoolService } from './question-pool.service';
import { QuestionDrawService } from './question-draw.service';
import { PoolSeedService } from './pool-seed.service';
import { PoolAdminService } from './pool-admin.service';
import { PoolIntegrityVerifierService } from './pool-integrity-verifier.service';
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

// ─── Build NestJS testing module ─────────────────────────────────────────────

async function buildService(
  drawServiceOverrides?: Partial<Record<keyof QuestionDrawService, jest.Mock>>,
): Promise<QuestionPoolService> {
  const drawServiceMock = {
    drawBoard: jest.fn().mockResolvedValue({ questions: [], poolQuestionIds: [] }),
    drawOneForSolo: jest.fn().mockResolvedValue(null),
    drawForDuel: jest.fn().mockResolvedValue([]),
    recordBoardHistory: jest.fn().mockResolvedValue(undefined),
    returnUnansweredToPool: jest.fn().mockResolvedValue(0),
    ...drawServiceOverrides,
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuestionPoolService,
      { provide: QuestionDrawService, useValue: drawServiceMock },
      { provide: PoolSeedService, useValue: { seedPool: jest.fn(), seedSlot: jest.fn(), refillIfNeeded: jest.fn() } },
      { provide: PoolAdminService, useValue: { cleanupPool: jest.fn(), deleteQuestionsExceptVersion: jest.fn(), getPoolGenerationVersions: jest.fn(), getPoolRawScoreStats: jest.fn(), getPoolQuestionsByRange: jest.fn(), getSeedPoolSessions: jest.fn(), getSessionQuestions: jest.fn(), getSeedPoolStats: jest.fn() } },
      { provide: PoolIntegrityVerifierService, useValue: { verifyPoolIntegrity: jest.fn() } },
    ],
  }).compile();

  return module.get<QuestionPoolService>(QuestionPoolService);
}

// ─── drawBoard — delegates to QuestionDrawService ────────────────────────────

describe('QuestionPoolService — drawBoard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns questions and poolQuestionIds from draw service', async () => {
    const poolQ = makeQuestion('pool1');
    const service = await buildService({
      drawBoard: jest.fn().mockResolvedValue({ questions: [poolQ], poolQuestionIds: ['pool1'] }),
    } as any);

    const result = await service.drawBoard();

    expect(result.poolQuestionIds).toContain('pool1');
    expect(result.questions).toContainEqual(poolQ);
  });

  it('throws ServiceUnavailableException when pool missing and LLM fallback disabled', async () => {
    const service = await buildService({
      drawBoard: jest.fn().mockRejectedValue(new ServiceUnavailableException('POOL_MISSING_SLOTS')),
    } as any);

    await expect(service.drawBoard(undefined, false)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('passes excludeNewsQuestionIds to draw service', async () => {
    const drawBoard = jest.fn().mockResolvedValue({ questions: [], poolQuestionIds: [] });
    const service = await buildService({ drawBoard } as any);

    await service.drawBoard(['news1', 'news2']);

    expect(drawBoard).toHaveBeenCalledWith(['news1', 'news2'], undefined, undefined);
  });
});

// ─── drawOneForSolo — category order ─────────────────────────────────────────

describe('QuestionPoolService — drawOneForSolo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns question from draw service', async () => {
    const question = makeQuestion('s1', SOLO_DRAW_CATEGORY_ORDER[0], 'EASY');
    const drawOneForSolo = jest.fn().mockResolvedValue(question);

    const service = await buildService({ drawOneForSolo } as any);
    const result = await service.drawOneForSolo('EASY');

    expect(result).toEqual(question);
    expect(drawOneForSolo).toHaveBeenCalledWith('EASY', undefined);
  });

  it('returns null when draw service finds nothing', async () => {
    const drawOneForSolo = jest.fn().mockResolvedValue(null);
    const service = await buildService({ drawOneForSolo } as any);
    const result = await service.drawOneForSolo('HARD');

    expect(result).toBeNull();
  });

  it('passes excludeIds to draw service', async () => {
    const drawOneForSolo = jest.fn().mockResolvedValue(null);
    const service = await buildService({ drawOneForSolo } as any);
    await service.drawOneForSolo('EASY', ['id1', 'id2']);

    expect(drawOneForSolo).toHaveBeenCalledWith('EASY', ['id1', 'id2']);
  });
});

// ─── drawForDuel — distribution and exclusion ─────────────────────────────────

describe('QuestionPoolService — drawForDuel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns questions from draw service', async () => {
    let callIndex = 0;
    const questions = DUEL_CATEGORIES.map((cat) =>
      makeQuestion(`q${callIndex++}`, cat as QuestionCategory, 'EASY'),
    );
    const drawForDuel = jest.fn().mockResolvedValue(questions);

    const service = await buildService({ drawForDuel } as any);
    const n = DUEL_CATEGORIES.length;
    const result = await service.drawForDuel(n);

    expect(result).toHaveLength(n);
    expect(drawForDuel).toHaveBeenCalledWith(n, undefined);
  });

  it('passes excludeIds from caller to draw service', async () => {
    const preExcluded = ['existing1'];
    const drawForDuel = jest.fn().mockResolvedValue([]);

    const service = await buildService({ drawForDuel } as any);
    await service.drawForDuel(5, preExcluded);

    expect(drawForDuel).toHaveBeenCalledWith(5, preExcluded);
  });
});
