import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { BotDuelRunner } from './bot-duel-runner.service';
import { BotBattleRoyaleRunner } from './bot-battle-royale-runner.service';
import { BattleRoyaleService } from '../battle-royale/battle-royale.service';

/** Seconds a game must be waiting before a bot is injected. */
const QUEUE_TIMEOUT_SECONDS = 30;

/** Minimum and maximum number of bots to fill into a Battle Royale room. */
const BR_BOT_MIN = 3;
const BR_BOT_MAX = 7;

@Injectable()
export class BotMatchmakerService {
  private readonly logger = new Logger(BotMatchmakerService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly botService: BotService,
    private readonly duelRunner: BotDuelRunner,
    private readonly brRunner: BotBattleRoyaleRunner,
    private readonly brService: BattleRoyaleService,
  ) {}

  @Cron('*/5 * * * * *') // every 5 seconds
  async checkQueues(): Promise<void> {
    await Promise.allSettled([
      this.injectBotsIntoOnlineQueues(),
      this.injectBotsIntoDuelQueues(),
      this.injectBotsIntoBattleRoyaleRooms(),
    ]);
  }

  // ── Online Game ─────────────────────────────────────────────────────────────

  private async injectBotsIntoOnlineQueues(): Promise<void> {
    const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_SECONDS * 1000).toISOString();

    const { data: games, error } = await this.supabaseService.client
      .from('online_games')
      .select('id, host_id')
      .eq('status', 'queued')
      .is('guest_id', null)
      .lt('created_at', cutoff)
      .limit(5);

    if (error || !games || games.length === 0) return;

    for (const game of games) {
      await this.matchBotForOnlineGame(game.id, game.host_id).catch((err) => {
        this.logger.warn(`[Matchmaker] Online game ${game.id} bot inject failed: ${err}`);
      });
    }
  }

  private async matchBotForOnlineGame(gameId: string, hostId: string): Promise<void> {
    const hostProfile = await this.supabaseService.getProfile(hostId);
    const playerElo = hostProfile?.elo ?? 1000;

    const bot = await this.botService.selectBot(playerElo);
    if (!bot) {
      this.logger.warn(`[Matchmaker] No bot available for online game ${gameId}`);
      return;
    }

    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await this.supabaseService.client
      .from('online_games')
      .update({
        guest_id: bot.id,
        status: 'active',
        current_player_id: hostId,
        turn_deadline: deadline,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('status', 'queued')
      .is('guest_id', null);

    if (error) {
      this.logger.warn(`[Matchmaker] Failed to inject bot into online game ${gameId}: ${error.message}`);
      return;
    }

    this.logger.log(`[Matchmaker] Bot "${bot.username}" matched into online game ${gameId}`);
  }

  // ── Duel ────────────────────────────────────────────────────────────────────

  private async injectBotsIntoDuelQueues(): Promise<void> {
    const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_SECONDS * 1000).toISOString();

    const { data: games, error } = await this.supabaseService.client
      .from('duel_games')
      .select('id, host_id')
      .eq('status', 'waiting')
      .is('invite_code', null)
      .is('guest_id', null)
      .lt('created_at', cutoff)
      .limit(5);

    if (error || !games || games.length === 0) return;

    for (const game of games) {
      await this.matchBotForDuel(game.id, game.host_id).catch((err) => {
        this.logger.warn(`[Matchmaker] Duel ${game.id} bot inject failed: ${err}`);
      });
    }
  }

  private async matchBotForDuel(gameId: string, hostId: string): Promise<void> {
    const hostProfile = await this.supabaseService.getProfile(hostId);
    const playerElo = hostProfile?.elo ?? 1000;

    const bot = await this.botService.selectBot(playerElo);
    if (!bot) {
      this.logger.warn(`[Matchmaker] No bot available for duel ${gameId}`);
      return;
    }

    const { data: updated, error } = await this.supabaseService.client
      .from('duel_games')
      .update({
        guest_id: bot.id,
        host_ready: true,
        guest_ready: true,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('status', 'waiting')
      .is('guest_id', null)
      .select('id')
      .single();

    if (error || !updated) {
      this.logger.warn(`[Matchmaker] Failed to inject bot into duel ${gameId}: ${error?.message}`);
      return;
    }

    this.logger.log(`[Matchmaker] Bot "${bot.username}" matched into duel ${gameId}`);
    this.duelRunner.runDuelBot(gameId, bot.id, bot.bot_skill);
  }

  // ── Battle Royale ───────────────────────────────────────────────────────────

  private async injectBotsIntoBattleRoyaleRooms(): Promise<void> {
    const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_SECONDS * 1000).toISOString();

    const { data: rooms, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, host_id')
      .eq('status', 'waiting')
      .lt('created_at', cutoff)
      .limit(5);

    if (error || !rooms || rooms.length === 0) return;

    for (const room of rooms) {
      await this.fillAndStartBRRoom(room.id, room.host_id).catch((err) => {
        this.logger.warn(`[Matchmaker] BR room ${room.id} bot fill failed: ${err}`);
      });
    }
  }

  private async fillAndStartBRRoom(roomId: string, hostId: string): Promise<void> {
    // Count real players already in the room
    const { count: playerCount } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);

    const realPlayers = playerCount ?? 1;
    const botsNeeded = Math.min(
      BR_BOT_MAX,
      Math.max(BR_BOT_MIN, 6 - realPlayers),
    );

    // Fetch average ELO of real players for bot skill matching
    const { data: playerRows } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('user_id')
      .eq('room_id', roomId);

    let avgElo = 1000;
    if (playerRows && playerRows.length > 0) {
      const elos = await Promise.all(
        (playerRows as { user_id: string }[]).map(async (p) => {
          const profile = await this.supabaseService.getProfile(p.user_id);
          return profile?.elo ?? 1000;
        }),
      );
      avgElo = Math.round(elos.reduce((sum, e) => sum + e, 0) / elos.length);
    }

    const bots = await this.botService.selectBotsForRoom(botsNeeded, avgElo);
    if (bots.length === 0) {
      this.logger.warn(`[Matchmaker] No bots available for BR room ${roomId}`);
      return;
    }

    // Add each bot as a player in the room
    for (const bot of bots) {
      await this.brService.addBotToRoom(roomId, bot.id, bot.username).catch((err) => {
        this.logger.warn(`[Matchmaker] Could not add bot ${bot.id} to BR room ${roomId}: ${err}`);
      });
    }

    // Force-start the room
    await this.brService.forceStartRoom(roomId);

    this.logger.log(`[Matchmaker] Started BR room ${roomId} with ${bots.length} bots (${realPlayers} real player(s))`);

    // Kick off bot answer chains
    this.brRunner.runBotsForRoom(
      roomId,
      bots.map((b) => ({ id: b.id, skill: b.bot_skill })),
    );
  }
}
