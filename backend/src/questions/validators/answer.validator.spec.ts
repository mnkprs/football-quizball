import { Test, TestingModule } from '@nestjs/testing';
import { AnswerValidator } from './answer.validator';
import { LlmService } from '../../llm/llm.service';
import type { GeneratedQuestion, Top5Entry } from '../question.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeQuestion(
  correct_answer: string,
  category = 'GENERAL_KNOWLEDGE',
): GeneratedQuestion {
  return {
    id: 'q1',
    question_text: 'Test question?',
    correct_answer,
    wrong_choices: ['W1', 'W2', 'W3'],
    explanation: 'Explanation.',
    category,
    difficulty: 'EASY',
  } as GeneratedQuestion;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('AnswerValidator', () => {
  let validator: AnswerValidator;
  let llmGenerateJson: jest.Mock;

  beforeEach(async () => {
    llmGenerateJson = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnswerValidator,
        {
          provide: LlmService,
          useValue: { generateStructuredJson: llmGenerateJson },
        },
      ],
    }).compile();

    validator = module.get(AnswerValidator);
  });

  // ── HIGHER_OR_LOWER ────────────────────────────────────────────────────

  describe('validate — HIGHER_OR_LOWER', () => {
    it.each([
      ['higher', 'higher', true],
      ['higher', 'Higher', true],
      ['higher', 'HIGH', true],
      ['higher', 'h', true],
      ['higher', 'more', true],
      ['higher', 'up', true],
      ['higher', 'lower', false],
      ['higher', 'banana', false],
      ['lower', 'lower', true],
      ['lower', 'Lower', true],
      ['lower', 'LOW', true],
      ['lower', 'l', true],
      ['lower', 'less', true],
      ['lower', 'down', true],
      ['lower', 'higher', false],
      ['lower', 'banana', false],
    ])(
      'correct=%s submitted=%s → %s',
      (correct, submitted, expected) => {
        const q = makeQuestion(correct, 'HIGHER_OR_LOWER');
        expect(validator.validate(q, submitted)).toBe(expected);
      },
    );
  });

  // ── GUESS_SCORE ────────────────────────────────────────────────────────

  describe('validate — GUESS_SCORE', () => {
    it.each([
      ['2-1', '2-1', true],
      ['2-1', '2:1', true],
      ['2-1', '2 1', true],
      ['2-1', '2\u20131', true],   // en-dash
      ['2-1', '2\u20141', true],   // em-dash
      ['2-1', '3-1', false],
      ['3-0', '3-0', true],
      ['3-0', '0-3', false],
    ])(
      'correct=%s submitted=%s → %s',
      (correct, submitted, expected) => {
        const q = makeQuestion(correct, 'GUESS_SCORE');
        expect(validator.validate(q, submitted)).toBe(expected);
      },
    );
  });

  // ── PLAYER_ID ──────────────────────────────────────────────────────────

  describe('validate — PLAYER_ID', () => {
    it.each([
      // exact match
      ['Lionel Messi', 'Lionel Messi', true],
      // last name only
      ['Lionel Messi', 'Messi', true],
      // first name only (length > 3)
      ['Lionel Messi', 'Lionel', true],
      // short first name rejected (length <= 3)
      ['Mo Salah', 'Mo', false],
      // mono-name (full = first = last)
      ['Ronaldinho', 'Ronaldinho', true],
      // compound last name — "De Bruyne" suffix
      ['Kevin De Bruyne', 'De Bruyne', true],
      // compound last name — "ten Hag" suffix
      ['Erik ten Hag', 'ten Hag', true],
      // fuzzy on full name — small typo
      ['Kylian Mbappe', 'Kylian Mbape', true],
      // accent-insensitive
      ['Kylian Mbappé', 'Kylian Mbappe', true],
      // completely wrong
      ['Lionel Messi', 'Cristiano Ronaldo', false],
      // last name fuzzy (distance 1, length > 4)
      ['Lionel Messi', 'Mesdi', true],
    ])(
      'correct="%s" submitted="%s" → %s',
      (correct, submitted, expected) => {
        const q = makeQuestion(correct, 'PLAYER_ID');
        expect(validator.validate(q, submitted)).toBe(expected);
      },
    );
  });

  // ── Default fuzzy ─────────────────────────────────────────────────────

  describe('validate — default fuzzy', () => {
    it.each([
      // exact match
      ['Barcelona', 'Barcelona', true],
      // case insensitive
      ['Barcelona', 'barcelona', true],
      // Levenshtein 1 for short string (<=6)
      ['Milan', 'Milam', true],
      ['Milan', 'Mxlxn', false],         // distance 2 on short string
      // Levenshtein 2 for medium string (7-12)
      ['Liverpool', 'Liverpol', true],    // distance 1
      ['Liverpool', 'Liverpl', true],     // distance 2
      ['Liverpool', 'Liverp', false],     // distance 3 on 9-char
      // Levenshtein 3 for long string (>12)
      ['Wolverhampton', 'Wolverhamton', true],  // distance 1
      // first word match — multi-word answer
      ['Inter Milan', 'Inter', true],
      // last word match
      ['Inter Milan', 'Milan', true],
      // completely wrong
      ['Barcelona', 'Madrid', false],
      // first word too short (<3)
      ['AC Milan', 'AC', false],
      // ── Reverse-prefix: submitted adds qualifier words to correct ──
      // (Regression for "as roma" → "Roma" bug reported 2026-04-19)
      ['Roma', 'AS Roma', true],           // "as roma" → "Roma" (2-char prefix qualifier)
      ['Bayern', 'FC Bayern', true],       // "fc bayern" → "Bayern"
      ['Bayern', 'FC Bayern Munich', true], // "fc bayern munich" → "Bayern" (suffix qualifier too)
      ['Real Madrid', 'Real Madrid CF', true], // correct itself is multi-word, "cf" suffix
      ['Milan', 'AC Milan', true],         // "ac milan" → "Milan" (Levenshtein-equivalent but test the reverse path)
      ['Arsenal', 'Arsenal FC', true],     // suffix-only qualifier
      // Guard: short stub alone must NOT match
      ['Real Madrid', 'CF', false],        // "cf" alone, too ambiguous
      ['Bayern', 'FC', false],             // "fc" alone
      // Guard: long sentence with correct word as last token does NOT match
      ['Roma', 'I really think it is roma', false], // too many extra words
      ['Roma', 'definitely the answer roma', false], // avg word length too long
    ])(
      'correct="%s" submitted="%s" → %s',
      (correct, submitted, expected) => {
        const q = makeQuestion(correct);
        expect(validator.validate(q, submitted)).toBe(expected);
      },
    );
  });

  // ── validateAsync — LLM judge flow ────────────────────────────────────

  describe('validateAsync', () => {
    it('returns true immediately for sync-correct answer without calling LLM', async () => {
      const q = makeQuestion('Barcelona');
      const result = await validator.validateAsync(q, 'Barcelona');
      expect(result).toBe(true);
      expect(llmGenerateJson).not.toHaveBeenCalled();
    });

    it.each([
      'HIGHER_OR_LOWER',
      'GUESS_SCORE',
      'PLAYER_ID',
      'TOP_5',
      'LOGO_QUIZ',
    ])(
      'does not call LLM for SKIP_JUDGE category %s',
      async (category) => {
        const q = makeQuestion('correct', category);
        const result = await validator.validateAsync(q, 'totally wrong');
        expect(result).toBe(false);
        expect(llmGenerateJson).not.toHaveBeenCalled();
      },
    );

    it('does not call LLM when fuzzy score is below MIN (< 0.4)', async () => {
      const q = makeQuestion('Barcelona');
      // completely different string → score ≈ 0
      const result = await validator.validateAsync(q, 'zzzzzzzzzzzzz');
      expect(result).toBe(false);
      expect(llmGenerateJson).not.toHaveBeenCalled();
    });

    it('calls LLM for borderline score and returns true when judge says yes', async () => {
      llmGenerateJson.mockResolvedValue({ answer: 'yes' });
      // "Rael Madird" vs "Real Madrid": sync fails (dist 4, maxDist 3), score ≈ 0.636 → in [0.4, 0.75)
      const q = makeQuestion('Real Madrid');
      const result = await validator.validateAsync(q, 'Rael Madird');
      expect(llmGenerateJson).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('calls LLM for borderline score and returns false when judge says no', async () => {
      llmGenerateJson.mockResolvedValue({ answer: 'no' });
      const q = makeQuestion('Real Madrid');
      const result = await validator.validateAsync(q, 'Rael Madird');
      expect(llmGenerateJson).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('returns false when LLM throws', async () => {
      llmGenerateJson.mockRejectedValue(new Error('LLM timeout'));
      const q = makeQuestion('Real Madrid');
      const result = await validator.validateAsync(q, 'Rael Madird');
      expect(result).toBe(false);
    });
  });

  // ── matchTop5Entry ────────────────────────────────────────────────────

  describe('matchTop5Entry', () => {
    const entries: Top5Entry[] = [
      { name: 'Lionel Messi', stat: '8' },
      { name: 'Cristiano Ronaldo', stat: '5' },
      { name: 'Kevin De Bruyne', stat: '4' },
      { name: 'Robert Lewandowski', stat: '3' },
      { name: 'Neymar Jr', stat: '2' },
    ];

    it.each([
      // exact full name match
      ['Lionel Messi', 0],
      // last name match
      ['Messi', 0],
      ['Ronaldo', 1],
      // first name match (length >= 3)
      ['Lionel', 0],
      ['Kevin', 2],
      // compound last name
      ['De Bruyne', 2],
      // multi-word prefix
      ['Cristiano Ronaldo', 1],
      // fuzzy match (small typo on full name)
      ['Lionel Mesdi', 0],
      // fuzzy last name (distance 1, length > 4)
      ['Mesdi', 0],
      // fuzzy first name (distance 1, length > 4)
      ['Kevim', 2],
      // Lewandowski by last name
      ['Lewandowski', 3],
      // no match at all
      ['Zinedine Zidane', -1],
      // empty string
      ['', -1],
    ])(
      'submitted="%s" → index %i',
      (submitted, expectedIndex) => {
        expect(validator.matchTop5Entry(entries, submitted)).toBe(expectedIndex);
      },
    );

    it('matches compound name suffix with fuzzy tolerance', () => {
      const compoundEntries: Top5Entry[] = [
        { name: 'Virgil van Dijk', stat: '10' },
      ];
      // "van Dijk" is a suffix starting at index 1
      expect(validator.matchTop5Entry(compoundEntries, 'van Dijk')).toBe(0);
      // fuzzy on compound suffix (distance 1, length >= 6)
      expect(validator.matchTop5Entry(compoundEntries, 'van Dijck')).toBe(0);
    });

    it('matches multi-word prefix when submitted is prefix of full name', () => {
      const longNameEntries: Top5Entry[] = [
        { name: 'Pierre Emerick Aubameyang', stat: '5' },
      ];
      expect(validator.matchTop5Entry(longNameEntries, 'Pierre Emerick')).toBe(0);
    });
  });
});
