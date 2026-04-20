import type { Difficulty } from '../common/interfaces/question.interface';

/**
 * Full logo question as loaded from the pool. Kept server-side only.
 * DO NOT return this shape over the wire — it contains the answer
 * (team_name, slug, original_image_url, league, country all disclose the team).
 */
export interface LogoQuestion {
  id: string;
  team_name: string;
  slug: string;
  league: string;
  country: string;
  difficulty: Difficulty;
  image_url: string;
  original_image_url: string;
  question_elo?: number;
}

/**
 * Public shape of a logo question served BEFORE the user answers.
 * Only fields that are safe to send to an untrusted client are included:
 * the obscured image, difficulty, and the ID used to correlate the POST.
 * Everything that would reveal the answer (team_name, slug, league,
 * country, original_image_url) is deliberately omitted and returned
 * only by POST /answer on the reveal response.
 */
export interface LogoQuestionPublic {
  id: string;
  difficulty: Difficulty;
  image_url: string;
  question_elo?: number;
}

export interface LogoQuizAnswerResult {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  /** Revealed only after submission so cheaters can't read it pre-answer. */
  original_image_url?: string;
  /** Revealed only after submission (reveal screen / leaderboard profile). */
  team_metadata?: {
    slug: string;
    league: string;
    country: string;
  };
  elo_before: number;
  elo_after: number;
  elo_change: number;
  elo_capped?: boolean;
  /** Set true when submission was rejected as too-fast (anti-robot). */
  rejected_too_fast?: boolean;
}
