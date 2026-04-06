import type { Difficulty } from '../common/interfaces/question.interface';

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

export interface LogoQuizAnswerResult {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  elo_capped?: boolean;
}
