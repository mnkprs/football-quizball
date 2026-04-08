import { EloService } from './elo.service';

describe('EloService', () => {
  let service: EloService;

  beforeEach(() => {
    service = new EloService();
  });

  describe('getDifficultyForElo', () => {
    it('returns EASY for ELO below 900', () => {
      expect(service.getDifficultyForElo(500)).toBe('EASY');
      expect(service.getDifficultyForElo(899)).toBe('EASY');
    });

    it('returns MEDIUM for ELO 900-1299', () => {
      expect(service.getDifficultyForElo(900)).toBe('MEDIUM');
      expect(service.getDifficultyForElo(1299)).toBe('MEDIUM');
    });

    it('returns HARD for ELO 1300-1799', () => {
      expect(service.getDifficultyForElo(1300)).toBe('HARD');
      expect(service.getDifficultyForElo(1799)).toBe('HARD');
    });

    it('returns EXPERT for ELO 1800+', () => {
      expect(service.getDifficultyForElo(1800)).toBe('EXPERT');
      expect(service.getDifficultyForElo(2500)).toBe('EXPERT');
    });
  });

  describe('applyChange', () => {
    it('applies positive change', () => {
      expect(service.applyChange(1000, 16)).toBe(1016);
    });

    it('floors at 500', () => {
      expect(service.applyChange(510, -20)).toBe(500);
      expect(service.applyChange(500, -100)).toBe(500);
    });
  });

  describe('getK (via calculate)', () => {
    it('produces larger changes at low ELO (K=40)', () => {
      const change = service.calculate(600, 'EASY', true, false, 100);
      // K=40, expected ~0.36 for 600 vs 700 question => change ~ +26
      expect(change).toBeGreaterThan(20);
    });

    it('produces smaller changes at high ELO (K=16)', () => {
      const change = service.calculate(2000, 'EXPERT', true, false, 100);
      // K=16, expected ~0.36 for 2000 vs 2100 => change ~ +10
      expect(change).toBeLessThan(15);
    });
  });

  describe('provisional multiplier', () => {
    it('applies 1.5x for < 30 questions', () => {
      const provisionalChange = service.calculate(1000, 'MEDIUM', true, false, 10);
      const settledChange = service.calculate(1000, 'MEDIUM', true, false, 200);
      expect(provisionalChange).toBeGreaterThan(settledChange);
    });

    it('applies 1.25x for 30-99 questions', () => {
      const midChange = service.calculate(1000, 'MEDIUM', true, false, 50);
      const settledChange = service.calculate(1000, 'MEDIUM', true, false, 200);
      expect(midChange).toBeGreaterThan(settledChange);
    });

    it('applies 1.0x for 100+ questions', () => {
      const a = service.calculate(1000, 'MEDIUM', true, false, 100);
      const b = service.calculate(1000, 'MEDIUM', true, false, 500);
      expect(a).toBe(b);
    });
  });

  describe('timeout penalty', () => {
    it('subtracts 5 on timeout', () => {
      const normal = service.calculate(1000, 'MEDIUM', false, false, 100);
      const timedOut = service.calculate(1000, 'MEDIUM', false, true, 100);
      expect(timedOut).toBe(normal - 5);
    });
  });
});
