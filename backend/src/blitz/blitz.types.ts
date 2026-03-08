export interface BlitzQuestion {
  poolRowId: string;
  question_text: string;
  correct_answer: string;
  category: string;
  difficulty: string;
}

export interface BlitzSession {
  id: string;
  userId: string;
  username: string;
  questions: BlitzQuestion[];
  currentIndex: number;
  score: number;
  totalAnswered: number;
  startTime: number;
  saved: boolean;
}

export interface BlitzAnswerResult {
  correct: boolean;
  correct_answer: string;
  score: number;
  total_answered: number;
  time_up: boolean;
  next_question: {
    question_id: string;
    question_text: string;
    category: string;
    difficulty: string;
  } | null;
}

export interface BlitzLeaderboardEntry {
  user_id: string;
  username: string;
  score: number;
  total_answered: number;
  created_at: string;
}
