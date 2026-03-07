import { Injectable } from '@nestjs/common';
import * as Levenshtein from 'fast-levenshtein';
import { GeneratedQuestion } from '../question.types';

@Injectable()
export class AnswerValidator {
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
    return distance <= maxDistance;
  }

  private validatePlayerName(correct: string, submitted: string): boolean {
    const normalCorrect = this.normalize(correct);
    const normalSubmitted = this.normalize(submitted);

    if (normalCorrect === normalSubmitted) return true;

    // Accept last name only
    const correctParts = normalCorrect.split(' ');
    const lastName = correctParts[correctParts.length - 1];
    if (lastName === normalSubmitted) return true;

    // Accept first name only (for mono-name players like "Ronaldinho", "Mbappe")
    const firstName = correctParts[0];
    if (firstName === normalSubmitted && firstName.length > 3) return true;

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
}
