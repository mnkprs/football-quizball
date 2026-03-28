import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { OnlineGameService } from '../online-game/online-game.service';
import { OnlineBoardCell, OnlineBoardState } from '../online-game/online-game.types';
import { GeneratedQuestion } from '../questions/question.types';

/** Minimum seconds a bot waits before taking its online game turn (simulates async human). */
const BOT_TURN_MIN_WAIT_SECONDS = 45;

@Injectable()
export class BotOnlineGameRunner {
  private readonly logger = new Logger(BotOnlineGameRunner.name);
  private _paused = false;

  get paused(): boolean {
    return this._paused;
  }

  pause(): void {
    this._paused = true;
    this.logger.warn('[BotOnlineRunner] Bot turns PAUSED');
  }

  resume(): void {
    this._paused = false;
    this.logger.warn('[BotOnlineRunner] Bot turns RESUMED');
  }

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly botService: BotService,
    private readonly onlineGameService: OnlineGameService,
  ) {}

  /**
   * Every 30 seconds: find active online games where the current player is a bot
   * and the turn has been pending long enough, then execute the bot's move.
   */
  @Cron('*/30 * * * * *')
  async executePendingBotTurns(): Promise<void> {
    if (this._paused) return;
    const cutoff = new Date(Date.now() - BOT_TURN_MIN_WAIT_SECONDS * 1000).toISOString();

    const { data: games, error } = await this.supabaseService.client
      .from('online_games')
      .select('id, current_player_id, host_id, guest_id, board_state, player_scores')
      .eq('status', 'active')
      .not('current_player_id', 'is', null)
      .lt('updated_at', cutoff)
      .limit(10);

    if (error || !games || games.length === 0) return;

    for (const game of games) {
      const currentPlayerId = game.current_player_id as string;
      const isBot = await this.supabaseService.isDummyUser(currentPlayerId);
      if (!isBot) continue;

      await this.executeBotTurn(
        game.id,
        currentPlayerId,
        game.board_state as OnlineBoardState,
      ).catch((err) => {
        this.logger.warn(`[BotOnlineRunner] Turn failed for game ${game.id}: ${err}`);
      });
    }
  }

  private async executeBotTurn(
    gameId: string,
    botId: string,
    boardState: OnlineBoardState,
  ): Promise<void> {
    // Pick a random unanswered cell
    const unanswered = boardState.cells.flat().filter((c: OnlineBoardCell) => !c.answered && c.question_id);
    if (unanswered.length === 0) return; // Board is fully answered

    const cell = unanswered[Math.floor(Math.random() * unanswered.length)];
    const questionId = cell.question_id;

    // Get the full question (with correct answer) from the board state
    const question = (boardState.questions as unknown as GeneratedQuestion[]).find(
      (q) => q.id === questionId,
    ) as GeneratedQuestion | undefined;
    if (!question) return;

    // Get bot's skill for accuracy calculation
    const botProfile = await this.supabaseService.client
      .from('dummy_users')
      .select('bot_skill')
      .eq('id', botId)
      .single();
    const botSkill = (botProfile.data as { bot_skill?: number } | null)?.bot_skill ?? 0.55;

    const correct = this.botService.shouldAnswerCorrectly(botSkill, question.difficulty);
    const answer = correct ? question.correct_answer : this.pickWrongAnswer(question);

    await this.onlineGameService.submitAnswer(botId, gameId, { questionId, answer });

    this.logger.log(
      `[BotOnlineRunner] Bot ${botId} answered "${questionId}" in game ${gameId} (${correct ? 'correct' : 'wrong'})`,
    );
  }

  private pickWrongAnswer(question: GeneratedQuestion): string {
    // Fifty-fifty hints give half the wrong options; fall back to a mutation
    const hint = question.fifty_fifty_hint;
    if (hint && hint.length > 0) {
      return hint[Math.floor(Math.random() * hint.length)];
    }
    return `${question.correct_answer}_bot_wrong`;
  }
}
