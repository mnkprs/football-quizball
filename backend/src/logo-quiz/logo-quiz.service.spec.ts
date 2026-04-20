import { LogoQuizService } from './logo-quiz.service';
import type { LogoQuestion } from './logo-quiz.types';

/**
 * Regression tests for the anti-cheat leak hardening (feat/anti-cheat-answer-hardening).
 *
 * The GET /api/logo-quiz/question response MUST NOT contain team_name, slug,
 * league, country, or original_image_url — any of these would let a cheater
 * read the answer off the wire. toPublicQuestion is the single chokepoint
 * that enforces this; if a future edit re-adds a sensitive field, these
 * tests should fail.
 */
describe('LogoQuizService.toPublicQuestion (leak regression)', () => {
  const makeFullQuestion = (): LogoQuestion => ({
    id: 'q-123',
    team_name: 'Arsenal',
    slug: 'arsenal-fc',
    league: 'Premier League',
    country: 'England',
    difficulty: 'EASY',
    image_url: 'https://cdn/obscured.png',
    original_image_url: 'https://cdn/original.png',
  });

  /**
   * Construct a bare instance that bypasses Nest DI — we only need to call
   * the private method via the `any` cast. Dependencies are never touched.
   */
  const getService = () => new (LogoQuizService as unknown as new (...args: unknown[]) => unknown)(
    null, null, null, null, null, null,
  ) as unknown as { toPublicQuestion(full: LogoQuestion, questionElo?: number): Record<string, unknown> };

  it('does not expose team_name', () => {
    const out = getService().toPublicQuestion(makeFullQuestion());
    expect(out).not.toHaveProperty('team_name');
  });

  it('does not expose original_image_url (the unobscured logo)', () => {
    const out = getService().toPublicQuestion(makeFullQuestion());
    expect(out).not.toHaveProperty('original_image_url');
  });

  it('does not expose slug / league / country (answer-narrowing metadata)', () => {
    const out = getService().toPublicQuestion(makeFullQuestion());
    expect(out).not.toHaveProperty('slug');
    expect(out).not.toHaveProperty('league');
    expect(out).not.toHaveProperty('country');
  });

  it('preserves id, difficulty, image_url (safe fields)', () => {
    const out = getService().toPublicQuestion(makeFullQuestion());
    expect(out).toEqual({
      id: 'q-123',
      difficulty: 'EASY',
      image_url: 'https://cdn/obscured.png',
    });
  });

  it('propagates question_elo when provided', () => {
    const out = getService().toPublicQuestion(makeFullQuestion(), 1550);
    expect(out).toHaveProperty('question_elo', 1550);
  });

  it('omits question_elo when not provided (instead of setting undefined)', () => {
    const out = getService().toPublicQuestion(makeFullQuestion());
    expect(Object.keys(out)).not.toContain('question_elo');
  });
});
