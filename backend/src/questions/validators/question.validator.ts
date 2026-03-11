import { Injectable } from '@nestjs/common';
import { GeneratedQuestion, Top5Entry } from '../question.types';
import type { ValidationResult } from '../../common/interfaces/validation.interface';

export type { ValidationResult };

/**
 * Validates question quality before inserting into the pool.
 * Catches LLM output bugs and malformed data.
 */
@Injectable()
export class QuestionValidator {
  private readonly MAX_QUESTION_LENGTH = 500;
  private readonly MAX_ANSWER_LENGTH = 300;
  private readonly SCORE_REGEX = /^\d{1,2}-\d{1,2}$/;

  validate(question: GeneratedQuestion): ValidationResult {
    if (!question.question_text?.trim()) {
      return { valid: false, reason: 'question_text is empty' };
    }
    if (!question.correct_answer?.trim()) {
      return { valid: false, reason: 'correct_answer is empty' };
    }
    if (!question.id?.trim()) {
      return { valid: false, reason: 'id is missing' };
    }
    if (question.question_text.length > this.MAX_QUESTION_LENGTH) {
      return { valid: false, reason: `question_text too long (${question.question_text.length})` };
    }
    if (question.correct_answer.length > this.MAX_ANSWER_LENGTH) {
      return { valid: false, reason: `correct_answer too long (${question.correct_answer.length})` };
    }

    if (question.fifty_fifty_applicable && question.fifty_fifty_hint) {
      const normCorrect = question.correct_answer.trim().toLowerCase();
      const normHint = question.fifty_fifty_hint.trim().toLowerCase();
      if (normCorrect === normHint) {
        return { valid: false, reason: 'fifty_fifty_hint equals correct_answer' };
      }
    }

    const answerInQuestion = this.answerAppearsInQuestion(question);
    if (answerInQuestion) {
      return {
        valid: false,
        reason: 'question_text contains the correct_answer (answer leaked in question)',
      };
    }

    switch (question.category) {
      case 'HIGHER_OR_LOWER':
        return this.validateHigherOrLower(question);
      case 'GUESS_SCORE':
        return this.validateGuessScore(question);
      case 'TOP_5':
        return this.validateTop5(question);
      default:
        return { valid: true };
    }
  }

  /**
   * Returns true if the correct answer appears in the question text (invalid — gives away the answer).
   * Handles GUESS_SCORE variants (7-1, 7 - 1, 7:1) and skips HIGHER_OR_LOWER (both options appear by design).
   */
  private answerAppearsInQuestion(question: GeneratedQuestion): boolean {
    const q = question.question_text.trim().toLowerCase();
    const a = question.correct_answer.trim().toLowerCase();

    if (question.category === 'HIGHER_OR_LOWER') {
      return false;
    }

    if (question.category === 'GUESS_SCORE') {
      const scoreMatch = a.match(/^(\d{1,2})-(\d{1,2})$/);
      if (scoreMatch) {
        const [, x, y] = scoreMatch;
        const patterns = [`${x}-${y}`, `${x} - ${y}`, `${x} – ${y}`, `${x}:${y}`];
        return patterns.some((p) => q.includes(p));
      }
    }

    if (a.length < 2) return false;
    return q.includes(a);
  }

  private validateHigherOrLower(q: GeneratedQuestion): ValidationResult {
    const ans = q.correct_answer.trim().toLowerCase();
    if (ans !== 'higher' && ans !== 'lower') {
      return { valid: false, reason: `HIGHER_OR_LOWER answer must be "higher" or "lower", got "${ans}"` };
    }
    return { valid: true };
  }

  private validateGuessScore(q: GeneratedQuestion): ValidationResult {
    const ans = q.correct_answer.trim().replace(/\s/g, '');
    if (!this.SCORE_REGEX.test(ans)) {
      return { valid: false, reason: `GUESS_SCORE answer must be "X-Y" format, got "${q.correct_answer}"` };
    }
    return { valid: true };
  }

  private validateTop5(q: GeneratedQuestion): ValidationResult {
    const top5 = q.meta?.top5 as Top5Entry[] | undefined;
    if (!Array.isArray(top5) || top5.length !== 5) {
      return { valid: false, reason: `TOP_5 must have meta.top5 with 5 entries, got ${top5?.length ?? 0}` };
    }
    for (let i = 0; i < top5.length; i++) {
      const entry = top5[i];
      if (!entry || typeof entry !== 'object' || !entry.name?.trim()) {
        return { valid: false, reason: `TOP_5 entry ${i + 1} missing name` };
      }
    }
    const expectedNames = top5.map((e) => e.name.trim().toLowerCase());
    const actualNames = q.correct_answer
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (expectedNames.length !== actualNames.length) {
      return { valid: false, reason: 'TOP_5 correct_answer count does not match meta.top5' };
    }
    const match = expectedNames.every((exp, i) => exp === actualNames[i]);
    if (!match) {
      return { valid: false, reason: 'TOP_5 correct_answer does not match meta.top5 names' };
    }
    return { valid: true };
  }
}
