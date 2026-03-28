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

/** Minimum number of public waiting BR rooms the matchmaker will maintain. */
const BR_MIN_WAITING_ROOMS = 2;

/** Number of seed bots to add when the matchmaker creates a new bot-hosted room. */
const BR_SEED_BOT_COUNT = 3;

/** Minutes a BR room can stay in 'waiting' before being deleted as stale. */
const STALE_BR_ROOM_MINUTES = 10;

@Injectable()
export class BotMatchmakerService {
  private readonly logger = new Logger(BotMatchmakerService.name);
  private checkQueuesRunning = false;
  private _paused = false;

  get paused(): boolean {
    return this._paused;
  }

  pause(): void {
    this._paused = true;
    this.logger.warn('[Matchmaker] Bot activity PAUSED');
  }

  resume(): void {
    this._paused = false;
    this.logger.warn('[Matchmaker] Bot activity RESUMED');
  }

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly botService: BotService,
    private readonly duelRunner: BotDuelRunner,
    private readonly brRunner: BotBattleRoyaleRunner,
    private readonly brService: BattleRoyaleService,
  ) {}

  @Cron('*/5 * * * * *') // every 5 seconds
  async checkQueues(): Promise<void> {
    if (this._paused || this.checkQueuesRunning) return;
    this.checkQueuesRunning = true;
    try {
      await Promise.allSettled([
        this.injectBotsIntoOnlineQueues(),
        this.injectBotsIntoDuelQueues(),
        this.injectBotsIntoBattleRoyaleRooms(),
        this.createBotBRRooms(),
        this.cleanStaleBRRooms(),
      ]);
    } finally {
      this.checkQueuesRunning = false;
    }
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
      .eq('game_type', 'standard')
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

  // ── Bot room creation ────────────────────────────────────────────────────────

  /**
   * Ensure the lobby always has at least BR_MIN_WAITING_ROOMS public waiting rooms.
   * If fewer exist, create new bot-hosted rooms pre-seeded with BR_SEED_BOT_COUNT bots
   * and leave them in 'waiting' so real players can discover and join them.
   * The existing fillAndStartBRRoom logic will force-start any room that remains
   * bot-only after QUEUE_TIMEOUT_SECONDS.
   */
  private async createBotBRRooms(): Promise<void> {
    const { count, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting')
      .eq('is_private', false);

    if (error) {
      this.logger.warn(`[Matchmaker] Could not count waiting BR rooms: ${error.message}`);
      return;
    }

    const waiting = count ?? 0;
    if (waiting >= BR_MIN_WAITING_ROOMS) return;

    const roomsToCreate = BR_MIN_WAITING_ROOMS - waiting;
    this.logger.log(`[Matchmaker] Only ${waiting} waiting BR room(s) — creating ${roomsToCreate} bot-hosted room(s)`);

    for (let i = 0; i < roomsToCreate; i++) {
      await this.createOneBotBRRoom().catch((err) => {
        this.logger.warn(`[Matchmaker] Failed to create bot BR room: ${err}`);
      });
    }
  }

  private async createOneBotBRRoom(): Promise<void> {
    // Pick the host bot at average skill
    const hostBot = await this.botService.selectBot(1000);
    if (!hostBot) {
      this.logger.warn('[Matchmaker] No host bot available to create BR room');
      return;
    }

    const { roomId } = await this.brService.createRoomForBot(hostBot.id, hostBot.username);
    this.logger.log(`[Matchmaker] Bot "${hostBot.username}" created BR room ${roomId}`);

    // Seed the room with additional bots so it looks lively in the lobby
    const seedBots = await this.botService.selectBotsForRoom(BR_SEED_BOT_COUNT, 1000);
    for (const bot of seedBots) {
      if (bot.id === hostBot.id) continue; // host is already in the room
      await this.brService.addBotToRoom(roomId, bot.id, bot.username).catch((err) => {
        this.logger.warn(`[Matchmaker] Could not seed bot ${bot.id} into new BR room ${roomId}: ${err}`);
      });
    }

    this.logger.log(`[Matchmaker] BR room ${roomId} seeded with ${seedBots.length} bot(s) — waiting for humans`);
  }

  // ── Stale room cleanup ───────────────────────────────────────────────────────

  /** Delete waiting BR rooms that have been open longer than STALE_BR_ROOM_MINUTES. */
  private async cleanStaleBRRooms(): Promise<void> {
    const staleAt = new Date(Date.now() - STALE_BR_ROOM_MINUTES * 60 * 1000).toISOString();
    const { error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .delete()
      .eq('status', 'waiting')
      .lt('created_at', staleAt);

    if (error) {
      this.logger.warn(`[Matchmaker] Stale BR room cleanup failed: ${error.message}`);
    }
  }
}
