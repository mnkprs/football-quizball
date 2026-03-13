export interface DailyQuestionTranslation {
  question_text: string;
  explanation: string;
}

export interface DailyQuestion {
  question_text: string;
  correct_answer: string;
  wrong_choices: string[];
  explanation: string;
}

export interface DailyQuestionRef {
  question_text: string;
  correct_answer: string;
  choices: string[];
  explanation: string;
  translations?: { el?: DailyQuestionTranslation };
}
