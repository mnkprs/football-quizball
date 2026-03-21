import { Test, TestingModule } from '@nestjs/testing';
import { Provider } from '@nestjs/common';
import { MayhemService } from './mayhem.service';
import { MayhemQuestionGenerator } from './mayhem-question.generator';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionValidator } from '../questions/validators/question.validator';
import { QuestionIntegrityService } from '../questions/validators/question-integrity.service';
import { DifficultyScorer } from '../questions/difficulty-scorer.service';

// ─── Shared mock factories ────────────────────────────────────────────────────

function buildSupabaseMock(overrides: Record<string, jest.Mock> = {}) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
    ...overrides,
  };
  // Make chained calls resolve to { data: [], error: null } by default
  chain.select.mockImplementation(() => ({ ...chain, then: undefined, data: [], error: null }));
  return { client: chain };
}

function buildGenerator(questions: object[] = []) {
  return { generateBatch: jest.fn().mockResolvedValue(questions) };
}

function makeQuestion(text = 'Q?', answer = 'A') {
  return {
    question_text: text,
    correct_answer: answer,
    wrong_choices: ['B', 'C', 'D'],
    explanation: 'Because.',
    category: 'HISTORY',
    difficulty: 'HARD',
  };
}

async function buildModule(
  supabase: object,
  generator: object,
  extraProviders: Provider[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      MayhemService,
      { provide: MayhemQuestionGenerator, useValue: generator },
      { provide: SupabaseService, useValue: supabase },
      { provide: QuestionValidator, useValue: { validate: jest.fn().mockReturnValue({ valid: true }) } },
      { provide: QuestionIntegrityService, useValue: { isEnabled: false } },
      { provide: DifficultyScorer, useValue: { score: jest.fn().mockReturnValue({ raw: 50 }) } },
      ...extraProviders,
    ],
  }).compile();
}

// ─── ingestMayhem ─────────────────────────────────────────────────────────────

describe('MayhemService — ingestMayhem', () => {
  it('returns early when already ingesting (concurrency guard)', async () => {
    // Build a generator that hangs so isIngesting stays true long enough
    let resolve!: () => void;
    const hangingPromise = new Promise<object[]>((res) => { resolve = () => res([]); });
    const generator = { generateBatch: jest.fn().mockReturnValueOnce(hangingPromise) };

    const supabase = {
      client: {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ count: 5, error: null }),
          gt: jest.fn().mockReturnThis(),
        }),
      },
    };

    const module = await buildModule(supabase, generator);
    const service = module.get<MayhemService>(MayhemService);

    // Patch getMayhemPoolCount so pool is below threshold
    jest.spyOn(service as any, 'getMayhemPoolCount').mockResolvedValue(0);

    const firstCall = service.ingestMayhem();
    const secondResult = await service.ingestMayhem(); // should return immediately

    expect(secondResult).toEqual({ added: 0, skipped: 0 });
    resolve(); // unblock first call
    await firstCall;
  });

  it('skips ingest when pool is already at or above target (20)', async () => {
    const generator = { generateBatch: jest.fn() };
    const module = await buildModule(buildSupabaseMock(), generator);
    const service = module.get<MayhemService>(MayhemService);

    jest.spyOn(service as any, 'getMayhemPoolCount').mockResolvedValue(20);

    const result = await service.ingestMayhem();

    expect(result).toEqual({ added: 0, skipped: 0 });
    expect(generator.generateBatch).not.toHaveBeenCalled();
  });
});

// ─── getMayhemQuestions ───────────────────────────────────────────────────────

describe('MayhemService — getMayhemQuestions', () => {
  const dbRow = {
    id: 'q1',
    question: {
      question_text: 'English Q?',
      correct_answer: 'English A',
      wrong_choices: ['W1', 'W2', 'W3'],
    },
  };

  function makeSupabaseWith(rows: object[]) {
    const chainEnd = { data: rows, error: null };
    const chain = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(chainEnd),
    };
    return { client: chain };
  }

  it('returns question text and options', async () => {
    const module = await buildModule(makeSupabaseWith([dbRow]), buildGenerator());
    const service = module.get<MayhemService>(MayhemService);

    const result = await service.getMayhemQuestions([]);

    expect(result[0].question_text).toBe('English Q?');
    expect(result[0].options).toContain('English A');
  });

  it('excludes rows whose id is in excludeIds', async () => {
    const module = await buildModule(makeSupabaseWith([dbRow]), buildGenerator());
    const service = module.get<MayhemService>(MayhemService);

    const result = await service.getMayhemQuestions(['q1']);

    expect(result).toHaveLength(0);
  });
});

// ─── checkMayhemAnswer ────────────────────────────────────────────────────────

describe('MayhemService — checkMayhemAnswer', () => {
  const dbAnswer = {
    question: { correct_answer: 'Lionel Messi', explanation: 'He scored the most.' },
  };

  function makeSupabaseWith(row: object | null) {
    const chainEnd = { data: row, error: null };
    const chain = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(chainEnd),
    };
    return { client: chain };
  }

  it('returns correct: true for exact match', async () => {
    const module = await buildModule(makeSupabaseWith(dbAnswer), buildGenerator());
    const service = module.get<MayhemService>(MayhemService);
    const result = await service.checkMayhemAnswer('q1', 'Lionel Messi');
    expect(result?.correct).toBe(true);
  });

  it('is case-insensitive', async () => {
    const module = await buildModule(makeSupabaseWith(dbAnswer), buildGenerator());
    const service = module.get<MayhemService>(MayhemService);
    const result = await service.checkMayhemAnswer('q1', 'lionel messi');
    expect(result?.correct).toBe(true);
  });

  it('returns correct: false for wrong answer', async () => {
    const module = await buildModule(makeSupabaseWith(dbAnswer), buildGenerator());
    const service = module.get<MayhemService>(MayhemService);
    const result = await service.checkMayhemAnswer('q1', 'Cristiano Ronaldo');
    expect(result?.correct).toBe(false);
  });

  it('returns null when question not found', async () => {
    const module = await buildModule(makeSupabaseWith(null), buildGenerator());
    const service = module.get<MayhemService>(MayhemService);
    const result = await service.checkMayhemAnswer('nonexistent', 'anything');
    expect(result).toBeNull();
  });

});
