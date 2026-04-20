import { EntityScarcityService } from './entity-scarcity.service';
import type { SupabaseService } from '../../supabase/supabase.service';

function mockSupabase(result: { data: unknown; error: unknown }): SupabaseService {
  const qb: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'not', 'limit']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.then = (onResolved: (r: unknown) => unknown) =>
    Promise.resolve(result).then(onResolved);
  return { client: qb } as unknown as SupabaseService;
}

describe('EntityScarcityService', () => {
  describe('getTagCoverage', () => {
    it('flattens tag arrays and counts appearances across rows', async () => {
      const rows = [
        { tags: ['lionel-messi', 'argentina', 'fifa-world-cup'] },
        { tags: ['lionel-messi', 'barcelona'] },
        { tags: ['cristiano-ronaldo', 'portugal', 'fifa-world-cup'] },
      ];
      const supabase = mockSupabase({ data: rows, error: null });
      const svc = new EntityScarcityService(supabase);

      const coverage = await svc.getTagCoverage('HISTORY');

      expect(coverage.get('lionel-messi')).toBe(2);
      expect(coverage.get('fifa-world-cup')).toBe(2);
      expect(coverage.get('argentina')).toBe(1);
      expect(coverage.get('barcelona')).toBe(1);
      expect(coverage.get('cristiano-ronaldo')).toBe(1);
      expect(coverage.get('portugal')).toBe(1);
      expect(coverage.size).toBe(6);
    });

    it('skips rows where tags is null', async () => {
      const rows = [
        { tags: null },
        { tags: ['a', 'b'] },
        { tags: null },
      ];
      const supabase = mockSupabase({ data: rows, error: null });
      const svc = new EntityScarcityService(supabase);

      const coverage = await svc.getTagCoverage('HISTORY');

      expect(coverage.size).toBe(2);
      expect(coverage.get('a')).toBe(1);
      expect(coverage.get('b')).toBe(1);
    });

    it('returns empty Map on Supabase error (fails open)', async () => {
      const supabase = mockSupabase({ data: null, error: { message: 'err' } });
      const svc = new EntityScarcityService(supabase);

      const coverage = await svc.getTagCoverage('HISTORY');

      expect(coverage.size).toBe(0);
    });

    it('returns empty Map when data is empty array', async () => {
      const supabase = mockSupabase({ data: [], error: null });
      const svc = new EntityScarcityService(supabase);

      const coverage = await svc.getTagCoverage('PLAYER_ID');

      expect(coverage.size).toBe(0);
    });
  });
});
