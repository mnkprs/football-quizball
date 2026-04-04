export interface BlitzQuestion {
  poolRowId: string;
  question_text: string;
  correct_answer: string;
  choices: string[];
  category: string;
  difficulty: string;
  meta?: Record<string, unknown>;
}

export interface BlitzSession {
  id: string;
  userId: string;
  username: string;
  questions: BlitzQuestion[];
  drawnIds: string[];
  currentIndex: number;
  score: number;
  totalAnswered: number;
  startTime: number;
  saved: boolean;
}

export interface BlitzQuestionRef {
  question_id: string;
  question_text: string;
  choices: string[];
  category: string;
  difficulty: string;
}

export interface BlitzAnswerResult {
  correct: boolean;
  correct_answer: string;
  score: number;
  total_answered: number;
  time_up: boolean;
  next_question: BlitzQuestionRef | null;
}

export interface BlitzLeaderboardEntry {
  user_id: string;
  username: string;
  score: number;
  total_answered: number;
  created_at?: string;
}

export interface BlitzLeaderboardEntryWithRank extends BlitzLeaderboardEntry {
  rank: number;
}
