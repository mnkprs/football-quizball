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

    it('stays at floor when ELO is exactly 500 and change is 0', () => {
      expect(service.applyChange(500, 0)).toBe(500);
    });

    it('does not go below 500 with a large negative change', () => {
      expect(service.applyChange(600, -999)).toBe(500);
    });

    it('handles large positive changes', () => {
      expect(service.applyChange(2000, 500)).toBe(2500);
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

  describe('calculateWithQuestionElo — exact math verification', () => {
    it.each([
      {
        label: 'player 1000 vs question 1100, correct, settled',
        playerElo: 1000,
        questionElo: 1100,
        correct: true,
        timedOut: false,
        totalQuestionsAnswered: 100,
        // K = 32 (1000 is in 900-1299 bracket), multiplier 1.0 (100+ questions)
        // expected = 1 / (1 + 10^((1100-1000)/400)) = 1 / (1 + 10^0.25) ≈ 1 / (1 + 1.7783) ≈ 0.3599
        // change = round(32 * (1 - 0.3599)) = round(32 * 0.6401) = round(20.48) = 20
        expectedChange: 20,
      },
      {
        label: 'player 1000 vs question 1100, wrong, settled',
        playerElo: 1000,
        questionElo: 1100,
        correct: false,
        timedOut: false,
        totalQuestionsAnswered: 100,
        // change = round(32 * (0 - 0.3599)) = round(-11.52) = -12
        expectedChange: -12,
      },
      {
        label: 'player 2000 vs question 700, correct — high expected',
        playerElo: 2000,
        questionElo: 700,
        correct: true,
        timedOut: false,
        totalQuestionsAnswered: 100,
        // K = 16 (2000 >= 1800), multiplier 1.0
        // expected = 1 / (1 + 10^((700-2000)/400)) = 1 / (1 + 10^(-3.25)) ≈ 1 / (1 + 0.000562) ≈ 0.9994
        // change = round(16 * (1 - 0.9994)) = round(16 * 0.0006) = round(0.009) = 0
        expectedChange: 0,
      },
      {
        label: 'player 500 vs question 2100, correct, provisional',
        playerElo: 500,
        questionElo: 2100,
        correct: true,
        timedOut: false,
        totalQuestionsAnswered: 10,
        // K = 40 (500 < 900), multiplier 1.5 (<30 questions) => effective K = 60
        // expected = 1 / (1 + 10^((2100-500)/400)) = 1 / (1 + 10^4) ≈ 1 / 10001 ≈ 0.0001
        // change = round(60 * (1 - 0.0001)) = round(59.994) = 60
        expectedChange: 60,
      },
    ])('$label → change = $expectedChange', ({ playerElo, questionElo, correct, timedOut, totalQuestionsAnswered, expectedChange }) => {
      const change = service.calculateWithQuestionElo(playerElo, questionElo, correct, timedOut, totalQuestionsAnswered);
      expect(change).toBe(expectedChange);
    });
  });

  describe('calculate — difficulty-to-questionElo mapping', () => {
    it.each([
      { difficulty: 'EASY' as const, questionElo: 700 },
      { difficulty: 'MEDIUM' as const, questionElo: 1100 },
      { difficulty: 'HARD' as const, questionElo: 1550 },
      { difficulty: 'EXPERT' as const, questionElo: 2100 },
    ])('calculate with $difficulty uses questionElo $questionElo', ({ difficulty, questionElo }) => {
      const playerElo = 1200;
      const totalQ = 100;

      const viaCalculate = service.calculate(playerElo, difficulty, true, false, totalQ);
      const viaQuestionElo = service.calculateWithQuestionElo(playerElo, questionElo, true, false, totalQ);

      expect(viaCalculate).toBe(viaQuestionElo);
    });
  });

  describe('K-factor boundary values', () => {
    it.each([
      { elo: 899, expectedK: 40, label: 'just below 900 → K base 40' },
      { elo: 900, expectedK: 32, label: 'exactly 900 → K base 32' },
      { elo: 1299, expectedK: 32, label: 'just below 1300 → K base 32' },
      { elo: 1300, expectedK: 24, label: 'exactly 1300 → K base 24' },
      { elo: 1799, expectedK: 24, label: 'just below 1800 → K base 24' },
      { elo: 1800, expectedK: 16, label: 'exactly 1800 → K base 16' },
    ])('$label', ({ elo, expectedK }) => {
      // Use a fixed questionElo equal to playerElo so expected = 0.5
      // With correct=true: change = round(K * (1 - 0.5)) = round(K * 0.5)
      // With totalQuestionsAnswered=100 so multiplier is 1.0
      const change = service.calculateWithQuestionElo(elo, elo, true, false, 100);
      expect(change).toBe(Math.round(expectedK * 0.5));
    });
  });

  describe('timeout + wrong answer combo', () => {
    it('timeout penalty stacks on top of wrong answer loss', () => {
      const wrongNoTimeout = service.calculateWithQuestionElo(1000, 1100, false, false, 100);
      const wrongWithTimeout = service.calculateWithQuestionElo(1000, 1100, false, true, 100);

      // wrong + timeout should be exactly 5 worse than wrong alone
      expect(wrongWithTimeout).toBe(wrongNoTimeout - 5);
      // both should be negative
      expect(wrongNoTimeout).toBeLessThan(0);
      expect(wrongWithTimeout).toBeLessThan(wrongNoTimeout);
    });
  });

  describe('symmetry — correct vs wrong with same params', () => {
    it.each([
      { playerElo: 1000, questionElo: 1000, totalQ: 100, label: 'equal ELOs' },
      { playerElo: 800, questionElo: 1200, totalQ: 50, label: 'player below question' },
      { playerElo: 1500, questionElo: 900, totalQ: 150, label: 'player above question' },
    ])('correct gives positive, wrong gives negative ($label)', ({ playerElo, questionElo, totalQ }) => {
      const correctChange = service.calculateWithQuestionElo(playerElo, questionElo, true, false, totalQ);
      const wrongChange = service.calculateWithQuestionElo(playerElo, questionElo, false, false, totalQ);

      expect(correctChange).toBeGreaterThan(0);
      expect(wrongChange).toBeLessThan(0);
    });
  });
});
