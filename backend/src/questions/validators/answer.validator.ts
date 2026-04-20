import { Injectable, Logger } from '@nestjs/common';
import * as Levenshtein from 'fast-levenshtein';
import { GeneratedQuestion, Top5Entry } from '../question.types';
import { LlmService } from '../../llm/llm.service';

const JUDGE_MIN_SCORE = 0.4;
const JUDGE_MAX_SCORE = 0.75;
const JUDGE_TIMEOUT_MS = 3500;

/** Categories where deterministic rules are sufficient — skip LLM judge. */
const SKIP_JUDGE_CATEGORIES = new Set(['HIGHER_OR_LOWER', 'GUESS_SCORE', 'PLAYER_ID', 'TOP_5', 'LOGO_QUIZ']);

@Injectable()
export class AnswerValidator {
  private readonly logger = new Logger(AnswerValidator.name);

  constructor(private readonly llmService: LlmService) {}

  validate(question: GeneratedQuestion, submittedAnswer: string): boolean {
    switch (question.category) {
      case 'HIGHER_OR_LOWER':
        return this.validateHigherOrLower(question.correct_answer, submittedAnswer);
      case 'GUESS_SCORE':
        return this.validateScore(question.correct_answer, submittedAnswer);
      case 'PLAYER_ID':
        return this.validatePlayerName(question.correct_answer, submittedAnswer);
      default:
        return this.validateFuzzy(question.correct_answer, submittedAnswer);
    }
  }

  private normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private validateFuzzy(correct: string, submitted: string): boolean {
    const normalCorrect = this.normalize(correct);
    const normalSubmitted = this.normalize(submitted);

    if (normalCorrect === normalSubmitted) return true;

    // Allow up to 2 character Levenshtein distance for short answers, more for longer
    const maxDistance = normalCorrect.length <= 6 ? 1 : normalCorrect.length <= 12 ? 2 : 3;
    const distance = Levenshtein.get(normalCorrect, normalSubmitted);
    if (distance <= maxDistance) return true;

    // Allow matching on first or last word (e.g. "inter" for "Inter Milan", "united" for "Manchester United")
    const parts = normalCorrect.split(' ');
    if (parts.length > 1) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      if (firstName === normalSubmitted && firstName.length >= 3) return true;
      if (lastName === normalSubmitted && lastName.length >= 3) return true;
      if (Levenshtein.get(firstName, normalSubmitted) <= 1 && firstName.length > 4) return true;
      if (Levenshtein.get(lastName, normalSubmitted) <= 1 && lastName.length > 4) return true;
    }

    // Reverse-prefix match: submitted adds qualifier words around correct.
    // Examples: "as roma" → "Roma", "fc bayern" → "Bayern", "real madrid cf" → "Real Madrid",
    // "fc bayern munich" → "Bayern" (correct appears mid-string).
    // Guard against "cf" alone matching "Real Madrid CF" by requiring the correct answer's
    // full normalized form to appear as a whole-word-boundaried substring of submitted,
    // AND extra qualifier words to be short (avg ≤4 chars), AND total extra words ≤2.
    const submittedParts = normalSubmitted.split(' ');
    const correctWordCount = normalCorrect.split(' ').length;
    if (submittedParts.length > correctWordCount && normalCorrect.length >= 3) {
      // Pad both sides with spaces so prefix / suffix / mid-string matches all work via includes().
      const paddedSubmitted = ` ${normalSubmitted} `;
      const paddedCorrect = ` ${normalCorrect} `;
      if (paddedSubmitted.includes(paddedCorrect)) {
        const extraWords = submittedParts.length - correctWordCount;
        const extraChars = normalSubmitted.length - normalCorrect.length - extraWords; // subtract joining spaces
        if (extraWords <= 2 && extraChars / Math.max(1, extraWords) <= 4) return true;
      }
    }

    return false;
  }

  private validatePlayerName(correct: string, submitted: string): boolean {
    const normalCorrect = this.normalize(correct);
    const normalSubmitted = this.normalize(submitted);

    if (normalCorrect === normalSubmitted) return true;

    const correctParts = normalCorrect.split(' ');
    const lastName = correctParts[correctParts.length - 1];
    const firstName = correctParts[0];

    // Accept last name only
    if (lastName === normalSubmitted) return true;

    // Accept first name only (for mono-name players like "Ronaldinho", "Mbappe")
    if (firstName === normalSubmitted && firstName.length > 3) return true;

    // Accept compound last name (e.g. "ten hag" for "Erik ten Hag", "de bruyne" for "Kevin de Bruyne")
    if (correctParts.length >= 3) {
      for (let start = 1; start < correctParts.length; start++) {
        const suffix = correctParts.slice(start).join(' ');
        if (suffix.length < 4) continue;
        if (suffix === normalSubmitted) return true;
        if (Levenshtein.get(suffix, normalSubmitted) <= 1 && suffix.length >= 6) return true;
      }
    }

    // Fuzzy on the full name
    const distance = Levenshtein.get(normalCorrect, normalSubmitted);
    const maxDistance = Math.floor(normalCorrect.length / 5);
    if (distance <= Math.max(2, maxDistance)) return true;

    // Fuzzy on last name
    const lastNameDistance = Levenshtein.get(lastName, normalSubmitted);
    return lastNameDistance <= 1;
  }

  private validateScore(correct: string, submitted: string): boolean {
    // Accept "2-1", "2 1", "2:1", "2–1"
    const normalizeScore = (s: string) =>
      s.trim().replace(/[\s:–—]/g, '-').replace(/[^0-9-]/g, '');

    return normalizeScore(correct) === normalizeScore(submitted);
  }

  private validateHigherOrLower(correct: string, submitted: string): boolean {
    const norm = submitted.toLowerCase().trim();
    if (correct === 'higher') return ['higher', 'high', 'h', 'more', 'up'].includes(norm);
    if (correct === 'lower') return ['lower', 'low', 'l', 'less', 'down'].includes(norm);
    return false;
  }

  private isMultiWordPrefixMatch(full: string, submitted: string): boolean {
    const submittedParts = submitted.split(' ');
    if (submittedParts.length < 2) return false;
    if (submitted.length < 6) return false;
    return full.startsWith(`${submitted} `);
  }

  /**
   * Returns fuzzy similarity score 0–1 between correct and submitted answers.
   * Used to decide whether to invoke the LLM judge.
   */
  private fuzzyScore(correct: string, submitted: string): number {
    const a = this.normalize(correct);
    const b = this.normalize(submitted);
    if (a === b) return 1;
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    const dist = Levenshtein.get(a, b);
    return 1 - dist / maxLen;
  }

  /** Calls LLM to judge if submitted is an acceptable alternative for correct. Times out after JUDGE_TIMEOUT_MS. */
  private validateWithJudge(question: GeneratedQuestion, correct: string, submitted: string): Promise<boolean> {
    const systemPrompt = 'You are an answer validation judge for a football quiz. Reply with only "yes" or "no".';
    const userPrompt = `Question: ${question.question_text}\nCorrect answer: ${correct}\nUser submitted: ${submitted}\nIs the submitted answer an acceptable alternative for the correct answer?`;

    const judgePromise = this.llmService.generateStructuredJson<{ answer: string }>(
      systemPrompt,
      `${userPrompt}\nReturn JSON: {"answer": "yes"} or {"answer": "no"}`,
      1,
    ).then(r => r.answer?.toLowerCase().trim() === 'yes').catch(() => false);

    const timeoutPromise = new Promise<false>(resolve => setTimeout(() => resolve(false), JUDGE_TIMEOUT_MS));
    return Promise.race([judgePromise, timeoutPromise]);
  }

  /**
   * Async validate: uses LLM judge for borderline fuzzy matches on text-answer categories.
   * Falls back to synchronous validate if not applicable.
   */
  async validateAsync(question: GeneratedQuestion, submittedAnswer: string): Promise<boolean> {
    // Sync result first
    const syncResult = this.validate(question, submittedAnswer);
    if (syncResult) return true;

    // Skip LLM judge for deterministic categories
    if (SKIP_JUDGE_CATEGORIES.has(question.category)) return false;

    // Only invoke judge if fuzzy score is in the borderline range
    const score = this.fuzzyScore(question.correct_answer, submittedAnswer);
    if (score < JUDGE_MIN_SCORE || score >= JUDGE_MAX_SCORE) return false;

    this.logger.debug(`[validateAsync] Invoking LLM judge (score=${score.toFixed(2)}) for "${submittedAnswer}" vs "${question.correct_answer}"`);
    return this.validateWithJudge(question, question.correct_answer, submittedAnswer);
  }

  /**
   * Try to match a submitted string against a list of Top5 entries.
   * Returns the 0-based index of the match, or -1 if no match.
   */
  matchTop5Entry(entries: Top5Entry[], submitted: string): number {
    const normalSubmitted = this.normalize(submitted);
    if (!normalSubmitted) return -1;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const normalFull = this.normalize(entry.name);
      const parts = normalFull.split(' ');
      const lastName = parts[parts.length - 1];
      const firstName = parts[0];

      // Exact full name match
      if (normalFull === normalSubmitted) return i;

      // Last name only (must be > 3 chars to avoid false positives)
      if (lastName === normalSubmitted && lastName.length >= 3) return i;

      // First word only (mono-name like "Pelé", or team shorthand like "Inter" for "Inter Milan")
      if (firstName === normalSubmitted && firstName.length >= 3) return i;

      // Accept a safe multi-word prefix like "sir alex" for "Sir Alex Ferguson"
      if (this.isMultiWordPrefixMatch(normalFull, normalSubmitted)) return i;

      // Accept compound last name (e.g. "ten hag" for "Erik ten Hag")
      if (parts.length >= 3) {
        let compoundMatch = false;
        for (let start = 1; start < parts.length; start++) {
          const suffix = parts.slice(start).join(' ');
          if (suffix.length < 4) continue;
          if (suffix === normalSubmitted) { compoundMatch = true; break; }
          if (Levenshtein.get(suffix, normalSubmitted) <= 1 && suffix.length >= 6) { compoundMatch = true; break; }
        }
        if (compoundMatch) return i;
      }

      // Fuzzy on full name
      const dist = Levenshtein.get(normalFull, normalSubmitted);
      if (dist <= Math.max(2, Math.floor(normalFull.length / 5))) return i;

      // Fuzzy on last name
      const lastDist = Levenshtein.get(lastName, normalSubmitted);
      if (lastDist <= 1 && lastName.length > 4) return i;

      // Fuzzy on first word (e.g. "Manchestr" for "Manchester United")
      const firstDist = Levenshtein.get(firstName, normalSubmitted);
      if (firstDist <= 1 && firstName.length > 4) return i;
    }

    return -1;
  }
}
