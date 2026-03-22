import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { BattleRoyaleService } from '../battle-royale/battle-royale.service';
import { BRRoomRow, BRPlayerRow } from '../battle-royale/battle-royale.types';
import { BlitzQuestion } from '../blitz/blitz.types';

@Injectable()
export class BotBattleRoyaleRunner {
  private readonly logger = new Logger(BotBattleRoyaleRunner.name);

  /**
   * Launch concurrent bot answer chains for all bots in a room.
   * Called once after the room is activated with bots as participants.
   */
  runBotsForRoom(roomId: string, bots: Array<{ id: string; skill: number }>): void {
    this.logger.log(`[BotBRRunner] Starting ${bots.length} bots for room ${roomId}`);
    for (const bot of bots) {
      void this.runSingleBot(roomId, bot.id, bot.skill);
    }
  }

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly botService: BotService,
    private readonly brService: BattleRoyaleService,
  ) {}

  private async runSingleBot(roomId: string, botId: string, botSkill: number): Promise<void> {
    const room = await this.fetchRoom(roomId);
    if (!room || room.status !== 'active') return;

    const questions = room.questions as BlitzQuestion[];
    let questionsAnswered = 0;
    let correctAnswers = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Wait to simulate human reading/thinking time
      const thinkTime = this.botService.simulateThinkTimeMs('battle-royale');
      await this.sleep(thinkTime);

      // Re-check room is still active
      const currentRoom = await this.fetchRoom(roomId);
      if (!currentRoom || currentRoom.status !== 'active') break;

      const correct = this.botService.shouldAnswerCorrectly(botSkill, q.difficulty);
      const answer = correct ? q.correct_answer : this.pickWrongChoice(q);

      try {
        await this.brService.submitAnswer(roomId, botId, i, answer);
        questionsAnswered++;
        if (correct) correctAnswers++;
      } catch (err) {
        this.logger.warn(`[BotBRRunner] Bot ${botId} answer error at q${i}: ${err}`);
        questionsAnswered++;
      }
    }

    this.botService.updateBotStats(botId, questionsAnswered, correctAnswers);
    this.logger.log(`[BotBRRunner] Bot ${botId} finished room ${roomId} (${correctAnswers}/${questionsAnswered} correct)`);
  }

  private async fetchRoom(roomId: string): Promise<Pick<BRRoomRow, 'status' | 'questions'> | null> {
    const { data, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('status, questions')
      .eq('id', roomId)
      .single<Pick<BRRoomRow, 'status' | 'questions'>>();
    if (error || !data) return null;
    return data;
  }

  private pickWrongChoice(q: BlitzQuestion): string {
    const wrong = q.choices.filter((c) => c !== q.correct_answer);
    if (wrong.length === 0) return q.choices[0] ?? 'unknown';
    return wrong[Math.floor(Math.random() * wrong.length)];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
