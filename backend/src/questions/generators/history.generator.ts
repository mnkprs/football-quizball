import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface SeedEntry {
  category: 'HISTORY';
  question_text: string;
  correct_answer: string;
  fifty_fifty_hint: string;
  fifty_fifty_applicable: boolean;
  explanation: string;
  image_url: string | null;
  difficulty_factors: DifficultyFactors;
}

const SEED_BANK: SeedEntry[] = [
  {
    category: 'HISTORY',
    question_text: 'In which year did England win the FIFA World Cup?',
    correct_answer: '1966',
    fifty_fifty_hint: '1 _ _ _',
    fifty_fifty_applicable: true,
    explanation: 'England won the World Cup in 1966, beating West Germany 4-2 in the final at Wembley.',
    image_url: null,
    difficulty_factors: { event_year: 1966, competition: 'FIFA World Cup', fame_score: 9 },
  },
  {
    category: 'HISTORY',
    question_text: 'Which club did Zinedine Zidane score a famous bicycle kick goal against in the 2002 Champions League final?',
    correct_answer: 'Bayer Leverkusen',
    fifty_fifty_hint: 'B _ _ _ _  _ _ _ _ _ _ _ _ _',
    fifty_fifty_applicable: true,
    explanation: "Zidane's volley against Bayer Leverkusen in the 2002 UCL final is widely considered the greatest goal in Champions League history.",
    image_url: null,
    difficulty_factors: { event_year: 2002, competition: 'UEFA Champions League', fame_score: 10 },
  },
  {
    category: 'HISTORY',
    question_text: 'How many times has Brazil won the FIFA World Cup?',
    correct_answer: '5',
    fifty_fifty_hint: 'Single digit number',
    fifty_fifty_applicable: true,
    explanation: 'Brazil has won the FIFA World Cup 5 times: 1958, 1962, 1970, 1994, and 2002.',
    image_url: null,
    difficulty_factors: { event_year: 2002, competition: 'FIFA World Cup', fame_score: 8 },
  },
  {
    category: 'HISTORY',
    question_text: 'Which player scored the "Hand of God" goal?',
    correct_answer: 'Diego Maradona',
    fifty_fifty_hint: 'D _ _ _ _  _ _ _ _ _ _ _',
    fifty_fifty_applicable: true,
    explanation: 'Diego Maradona scored the infamous "Hand of God" goal against England in the 1986 World Cup quarter-finals.',
    image_url: null,
    difficulty_factors: { event_year: 1986, competition: 'FIFA World Cup', fame_score: 10 },
  },
  {
    category: 'HISTORY',
    question_text: 'Which club won the first ever Premier League title in 1992-93?',
    correct_answer: 'Manchester United',
    fifty_fifty_hint: 'M _ _ _ _ _ _ _ _ _  U _ _ _ _ _',
    fifty_fifty_applicable: true,
    explanation: 'Manchester United won the inaugural Premier League title in 1992-93 under Sir Alex Ferguson.',
    image_url: null,
    difficulty_factors: { event_year: 1993, competition: 'Premier League', fame_score: 7 },
  },
];

@Injectable()
export class HistoryGenerator {
  private readonly logger = new Logger(HistoryGenerator.name);

  constructor(private llmService: LlmService) {}

  async generate(): Promise<GeneratedQuestion> {
    try {
      const systemPrompt = `You are a football trivia expert. Generate an interesting football history question on any topic.
Topics can include: World Cup history, club history, famous matches, records, trophies, historic moments.
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "fifty_fifty_hint": "first letter of each word with blanks, e.g. 'M _ _ _ _ _ _ _ _  U _ _ _ _ _'",
  "explanation": "brief explanation of why this is correct (1-2 sentences)",
  "event_year": 1966,
  "competition": "Competition or league name e.g. FIFA World Cup, Premier League, UEFA Champions League",
  "fame_score": 8
}
The fame_score is 1-10: 10 = universally iconic like Zidane headbutt, 1 = hyper-niche fact.`;

      const userPrompt = `Generate a unique football history trivia question. It can be about any era, league, or competition. Make it specific and interesting. Return JSON only.`;

      const result = await this.llmService.generateStructuredJson<{
        question_text: string;
        correct_answer: string;
        fifty_fifty_hint: string;
        explanation: string;
        event_year: number;
        competition: string;
        fame_score: number;
      }>(systemPrompt, userPrompt);

      if (!result.question_text || !result.correct_answer) {
        throw new Error('Invalid LLM response structure');
      }

      return {
        id: uuidv4(),
        category: 'HISTORY',
        difficulty: 'EASY',
        points: 1,
        question_text: result.question_text,
        correct_answer: result.correct_answer,
        fifty_fifty_hint: result.fifty_fifty_hint || null,
        fifty_fifty_applicable: true,
        explanation: result.explanation || '',
        image_url: null,
        difficulty_factors: {
          event_year: result.event_year ?? new Date().getFullYear(),
          competition: result.competition ?? 'Unknown',
          fame_score: result.fame_score ?? null,
        },
      };
    } catch (err) {
      this.logger.warn(`LLM history generation failed, using seed bank: ${(err as Error).message}`);
      return this.getSeedQuestion();
    }
  }

  private getSeedQuestion(): GeneratedQuestion {
    const seed = SEED_BANK[Math.floor(Math.random() * SEED_BANK.length)];
    return { ...seed, id: uuidv4(), difficulty: 'EASY', points: 1 };
  }
}
