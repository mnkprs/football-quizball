import { Injectable, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { OnlineGameService } from '../online-game/online-game.service';
import { OnlineBoardCell, OnlineBoardState } from '../online-game/online-game.types';
import { GeneratedQuestion } from '../questions/question.types';
import { BotLogger } from './bot-logger';
import { BOT_ONLINE_RUNNER_INTERVAL_MS, BOT_TURN_MIN_WAIT_SECONDS } from './bot-config';

@Injectable()
export class BotOnlineGameRunner implements OnModuleInit {
  private readonly logger = new BotLogger('OnlineRunner');
  private _paused = false;

  get paused(): boolean {
    return this._paused;
  }

  async pause(): Promise<void> {
    this._paused = true;
    await this.supabaseService.setSetting('bots_paused', 'true');
    this.logger.warn('Bot turns PAUSED (persisted)');
  }

  async resume(): Promise<void> {
    this._paused = false;
    await this.supabaseService.setSetting('bots_paused', 'false');
    this.logger.warn('Bot turns RESUMED (persisted)');
  }

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly botService: BotService,
    private readonly onlineGameService: OnlineGameService,
  ) {}

  async onModuleInit(): Promise<void> {
    const value = await this.supabaseService.getSetting('bots_paused');
    this._paused = value === 'true';
    if (this._paused) {
      this.logger.warn('Bot turns PAUSED (restored from database)');
    }
  }

  /**
   * Every 30 seconds: find active online games where the current player is a bot
   * and the turn has been pending long enough, then execute the bot's move.
   */
  @Interval(BOT_ONLINE_RUNNER_INTERVAL_MS)
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

    this.logger.debug(
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
