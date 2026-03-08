import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GeographyGenerator {
  private readonly logger = new Logger(GeographyGenerator.name);

  constructor(private llmService: LlmService) {}

  async generate(): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football geography expert. Generate a football-related geography question.
Topics can include: countries with famous clubs, cities and their football teams, stadium locations, nationalities of famous players, nations that have hosted tournaments, FIFA/UEFA confederation memberships.
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "fifty_fifty_hint": "first letter of each word with blanks, e.g. 'B _ _ _ _ _'",
  "explanation": "brief explanation (1-2 sentences)",
  "event_year": 2010,
  "competition": "Competition or league name e.g. FIFA World Cup, Premier League",
  "fame_score": 7
}
fame_score is 1-10: 10 = universally known geography fact, 1 = very obscure.`;

    const userPrompt = `Generate a unique football geography trivia question. It can be about any country, city, stadium, or tournament location. Make it interesting. Return JSON only.`;

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
      throw new Error('Invalid LLM response: missing question_text or correct_answer');
    }

    return {
      id: uuidv4(),
      category: 'GEOGRAPHY',
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
  }
}
