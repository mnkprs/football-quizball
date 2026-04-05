import { Injectable } from '@nestjs/common';
import { BotLogger } from './bot-logger';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { DuelService } from '../duel/duel.service';
import { DuelGameRow } from '../duel/duel.types';
import { GeneratedQuestion } from '../questions/question.types';

/** Max questions tracked before giving up on a stale duel. */
const MAX_QUESTIONS = 60;

@Injectable()
export class BotDuelRunner {
  private readonly logger = new BotLogger('DuelRunner');

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly duelService: DuelService,
    private readonly botService: BotService,
  ) {}

  /**
   * Start an async bot loop for a duel game.
   * Called once when a bot is matched into a duel.
   * The bot will answer questions until the game ends.
   */
  runDuelBot(gameId: string, botId: string, botSkill: number): void {
    this.logger.debug(`Starting bot ${botId} for duel ${gameId}`);
    void this.botLoop(gameId, botId, botSkill, 0, 0, 0);
  }

  private async botLoop(
    gameId: string,
    botId: string,
    botSkill: number,
    questionsAnswered: number,
    correctAnswers: number,
    attempts: number,
  ): Promise<void> {
    if (attempts > MAX_QUESTIONS) {
      this.logger.warn(`Max attempts reached for duel ${gameId}, stopping bot ${botId}`);
      this.botService.updateBotStats(botId, questionsAnswered, correctAnswers);
      return;
    }

    const row = await this.fetchDuelRow(gameId);
    if (!row) return;

    if (row.status === 'finished' || row.status === 'abandoned') {
      this.logger.debug(`Duel ${gameId} ended, bot ${botId} stopping`);
      this.botService.updateBotStats(botId, questionsAnswered, correctAnswers);
      return;
    }

    if (row.status !== 'active') {
      // Not yet active — wait a bit and retry
      setTimeout(() => void this.botLoop(gameId, botId, botSkill, questionsAnswered, correctAnswers, attempts + 1), 1_000);
      return;
    }

    // Check if question is already answered
    if (row.current_question_answered_by !== null) {
      // Question claimed — wait for index to advance
      setTimeout(() => void this.botLoop(gameId, botId, botSkill, questionsAnswered, correctAnswers, attempts + 1), 300);
      return;
    }

    const questionIndex = row.current_question_index;
    const question = row.questions[questionIndex] as GeneratedQuestion | undefined;
    if (!question) {
      this.botService.updateBotStats(botId, questionsAnswered, correctAnswers);
      return;
    }

    // Simulate think time before answering
    const thinkTime = this.botService.simulateThinkTimeMs('duel');

    setTimeout(async () => {
      const correct = this.botService.shouldAnswerCorrectly(botSkill, question.difficulty);
      const answer = correct ? question.correct_answer : this.pickWrongAnswer(question);

      try {
        const result = await this.duelService.submitAnswer(botId, gameId, { answer, questionIndex });
        const nextQuestions = questionsAnswered + 1;
        const nextCorrect = correctAnswers + (correct ? 1 : 0);

        if (!result.correct) {
          // Wrong answer — wait a moment then re-check (human might answer or time out)
          setTimeout(
            () => void this.botLoop(gameId, botId, botSkill, nextQuestions, nextCorrect, 0),
            3_000,
          );
        } else {
          // Correct — wait briefly then check for next question
          setTimeout(
            () => void this.botLoop(gameId, botId, botSkill, nextQuestions, nextCorrect, 0),
            500,
          );
        }
      } catch {
        // If answer fails (e.g. ConflictException — player was faster), wait for index to advance
        setTimeout(
          () => void this.botLoop(gameId, botId, botSkill, questionsAnswered, correctAnswers, attempts + 1),
          400,
        );
      }
    }, thinkTime);
  }

  private async fetchDuelRow(gameId: string): Promise<DuelGameRow | null> {
    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .select('id, status, questions, current_question_index, current_question_answered_by, host_id, guest_id')
      .eq('id', gameId)
      .single();
    if (error || !data) return null;
    return data as DuelGameRow;
  }

  private pickWrongAnswer(question: GeneratedQuestion): string {
    // For duel, questions are open-ended — return a plausible wrong answer
    // by appending a small mutation to the correct answer so validation clearly fails
    return `${question.correct_answer}_wrong_${Math.floor(Math.random() * 100)}`;
  }
}
