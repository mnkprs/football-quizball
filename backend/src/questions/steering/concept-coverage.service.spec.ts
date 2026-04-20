import { ConceptCoverageService } from './concept-coverage.service';
import type { SupabaseService } from '../../supabase/supabase.service';

/** Builds a thenable query-builder mock. Every chainable method returns itself;
 *  awaiting the chain resolves to `result`. */
function mockSupabase(result: { data: unknown; error: unknown }): SupabaseService {
  const qb: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'not', 'order', 'limit']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.then = (onResolved: (r: unknown) => unknown) =>
    Promise.resolve(result).then(onResolved);
  return { client: qb } as unknown as SupabaseService;
}

describe('ConceptCoverageService', () => {
  describe('getCoverage', () => {
    it('aggregates raw rows into concept_id → count', async () => {
      const rows = [
        { concept_id: 'world-cup-winners' },
        { concept_id: 'world-cup-winners' },
        { concept_id: 'world-cup-winners' },
        { concept_id: 'ballon-dor-history' },
        { concept_id: 'ballon-dor-history' },
        { concept_id: 'manager-trophy-history' },
      ];
      const supabase = mockSupabase({ data: rows, error: null });
      const svc = new ConceptCoverageService(supabase);

      const coverage = await svc.getCoverage('HISTORY');

      expect(coverage).toHaveLength(3);
      const byId = Object.fromEntries(
        coverage.map((c) => [c.concept_id, c.count]),
      );
      expect(byId['world-cup-winners']).toBe(3);
      expect(byId['ballon-dor-history']).toBe(2);
      expect(byId['manager-trophy-history']).toBe(1);
    });

    it('returns empty array when Supabase returns an error (fails open)', async () => {
      const supabase = mockSupabase({ data: null, error: { message: 'network' } });
      const svc = new ConceptCoverageService(supabase);

      const coverage = await svc.getCoverage('HISTORY');

      expect(coverage).toEqual([]);
    });

    it('returns empty array when data is null', async () => {
      const supabase = mockSupabase({ data: null, error: null });
      const svc = new ConceptCoverageService(supabase);

      const coverage = await svc.getCoverage('PLAYER_ID');

      expect(coverage).toEqual([]);
    });

    it('returns empty array when pool is empty for this category', async () => {
      const supabase = mockSupabase({ data: [], error: null });
      const svc = new ConceptCoverageService(supabase);

      const coverage = await svc.getCoverage('GOSSIP');

      expect(coverage).toEqual([]);
    });
  });

  describe('getSampleQuestions', () => {
    it('returns mapped question_text values', async () => {
      const rows = [
        { question_text: 'Who won the 2018 World Cup?' },
        { question_text: 'Who scored in the 2014 final?' },
      ];
      const supabase = mockSupabase({ data: rows, error: null });
      const svc = new ConceptCoverageService(supabase);

      const samples = await svc.getSampleQuestions(
        'HISTORY',
        'world-cup-winners',
        2,
      );

      expect(samples).toEqual([
        'Who won the 2018 World Cup?',
        'Who scored in the 2014 final?',
      ]);
    });

    it('filters out empty/undefined question_text', async () => {
      const rows = [
        { question_text: 'Valid question' },
        { question_text: '' },
        { question_text: null },
        { question_text: 'Another valid one' },
      ];
      const supabase = mockSupabase({ data: rows, error: null });
      const svc = new ConceptCoverageService(supabase);

      const samples = await svc.getSampleQuestions('HISTORY', 'x', 10);

      expect(samples).toEqual(['Valid question', 'Another valid one']);
    });

    it('returns empty array on error', async () => {
      const supabase = mockSupabase({ data: null, error: { message: 'err' } });
      const svc = new ConceptCoverageService(supabase);

      const samples = await svc.getSampleQuestions('HISTORY', 'x');

      expect(samples).toEqual([]);
    });
  });
});
