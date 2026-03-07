import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion, Difficulty } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

const SEED_BANK: Omit<GeneratedQuestion, 'id' | 'difficulty' | 'points'>[] = [
  {
    category: 'HISTORY',
    question_text: 'In which year did England win the FIFA World Cup?',
    correct_answer: '1966',
    fifty_fifty_hint: '1 _ _ _',
    fifty_fifty_applicable: true,
    explanation: 'England won the World Cup in 1966, beating West Germany 4-2 in the final at Wembley.',
    image_url: null,
  },
  {
    category: 'HISTORY',
    question_text: 'Which club did Zinedine Zidane score a famous bicycle kick goal against in the 2002 Champions League final?',
    correct_answer: 'Bayer Leverkusen',
    fifty_fifty_hint: 'B _ _ _ _  _ _ _ _ _ _ _ _ _',
    fifty_fifty_applicable: true,
    explanation: 'Zidane\'s volley against Bayer Leverkusen in the 2002 UCL final is widely considered the greatest goal in Champions League history.',
    image_url: null,
  },
  {
    category: 'HISTORY',
    question_text: 'How many times has Brazil won the FIFA World Cup?',
    correct_answer: '5',
    fifty_fifty_hint: 'Single digit number',
    fifty_fifty_applicable: true,
    explanation: 'Brazil has won the FIFA World Cup 5 times: 1958, 1962, 1970, 1994, and 2002.',
    image_url: null,
  },
  {
    category: 'HISTORY',
    question_text: 'Which player scored the "Hand of God" goal?',
    correct_answer: 'Diego Maradona',
    fifty_fifty_hint: 'D _ _ _ _  _ _ _ _ _ _ _',
    fifty_fifty_applicable: true,
    explanation: 'Diego Maradona scored the infamous "Hand of God" goal against England in the 1986 World Cup quarter-finals.',
    image_url: null,
  },
  {
    category: 'HISTORY',
    question_text: 'Which club won the first ever Premier League title in 1992-93?',
    correct_answer: 'Manchester United',
    fifty_fifty_hint: 'M _ _ _ _ _ _ _ _ _  U _ _ _ _ _',
    fifty_fifty_applicable: true,
    explanation: 'Manchester United won the inaugural Premier League title in 1992-93 under Sir Alex Ferguson.',
    image_url: null,
  },
];

@Injectable()
export class HistoryGenerator {
  private readonly logger = new Logger(HistoryGenerator.name);

  constructor(private llmService: LlmService) {}

  async generate(difficulty: Difficulty, points: number): Promise<GeneratedQuestion> {
    try {
      const difficultyContext = {
        EASY: 'well-known facts that most football fans would know',
        MEDIUM: 'moderately obscure facts requiring good football knowledge',
        HARD: 'highly specific facts, stats, or dates that only serious football historians would know',
      }[difficulty];

      const systemPrompt = `You are a football trivia expert. Generate a ${difficulty} level football history question.
Focus on ${difficultyContext}. Topics can include: World Cup history, club history, famous matches, records, trophies, historic moments.
Do NOT repeat commonly known facts for HARD questions.
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "fifty_fifty_hint": "first letter of each word with blanks, e.g. 'M _ _ _ _ _ _ _ _  U _ _ _ _ _'",
  "explanation": "brief explanation of why this is correct (1-2 sentences)"
}`;

      const userPrompt = `Generate a unique ${difficulty} football history trivia question. Make it specific and interesting. Return JSON only.`;

      const result = await this.llmService.generateStructuredJson<{
        question_text: string;
        correct_answer: string;
        fifty_fifty_hint: string;
        explanation: string;
      }>(systemPrompt, userPrompt);

      if (!result.question_text || !result.correct_answer) {
        throw new Error('Invalid LLM response structure');
      }

      return {
        id: uuidv4(),
        category: 'HISTORY',
        difficulty,
        points,
        question_text: result.question_text,
        correct_answer: result.correct_answer,
        fifty_fifty_hint: result.fifty_fifty_hint || null,
        fifty_fifty_applicable: true,
        explanation: result.explanation || '',
        image_url: null,
      };
    } catch (err) {
      this.logger.warn(`LLM history generation failed, using seed bank: ${(err as Error).message}`);
      return this.getSeedQuestion(difficulty, points);
    }
  }

  private getSeedQuestion(difficulty: Difficulty, points: number): GeneratedQuestion {
    const idx = Math.floor(Math.random() * SEED_BANK.length);
    const seed = SEED_BANK[idx];
    return { ...seed, id: uuidv4(), difficulty, points };
  }
}
