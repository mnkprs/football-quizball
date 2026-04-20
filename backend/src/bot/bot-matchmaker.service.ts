import { Injectable, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { BotDuelRunner } from './bot-duel-runner.service';
import { BotBattleRoyaleRunner } from './bot-battle-royale-runner.service';
import { BattleRoyaleService } from '../battle-royale/battle-royale.service';
import { BotLogger } from './bot-logger';
import {
  BOT_MATCHMAKER_INTERVAL_MS,
  BOT_STALE_CLEANUP_INTERVAL_MS,
  QUEUE_TIMEOUT_SECONDS,
  BR_BOT_MIN,
  BR_BOT_MAX,
  BR_MIN_WAITING_ROOMS,
  BR_SEED_BOT_COUNT,
  STALE_BR_ROOM_MINUTES,
} from './bot-config';

@Injectable()
export class BotMatchmakerService implements OnModuleInit {
  private readonly logger = new BotLogger('Matchmaker');
  private checkQueuesRunning = false;
  private _paused = false;

  get paused(): boolean {
    return this._paused;
  }

  async pause(): Promise<void> {
    this._paused = true;
    await this.supabaseService.setSetting('bots_paused', 'true');
    this.logger.warn('Bot activity PAUSED (persisted)');
  }

  async resume(): Promise<void> {
    this._paused = false;
    await this.supabaseService.setSetting('bots_paused', 'false');
    this.logger.warn('Bot activity RESUMED (persisted)');
  }

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly botService: BotService,
    private readonly duelRunner: BotDuelRunner,
    private readonly brRunner: BotBattleRoyaleRunner,
    private readonly brService: BattleRoyaleService,
  ) {}

  async onModuleInit(): Promise<void> {
    const value = await this.supabaseService.getSetting('bots_paused');
    this._paused = value === 'true';
    if (this._paused) {
      this.logger.warn('Bot activity PAUSED (restored from database)');
    }
  }

  @Interval(BOT_MATCHMAKER_INTERVAL_MS)
  async checkQueues(): Promise<void> {
    if (this._paused || this.checkQueuesRunning) return;
    this.checkQueuesRunning = true;
    try {
      // Lightweight idle check — skip cycle if nothing is waiting
      const hasWork = await this.hasQueuedWork();
      if (!hasWork) {
        this.logger.debug('No queued work — skipping cycle');
        return;
      }

      await Promise.allSettled([
        this.injectBotsIntoOnlineQueues(),
        this.injectBotsIntoDuelQueues(),
        this.injectBotsIntoBattleRoyaleRooms(),
        this.createBotBRRooms(),
      ]);
    } finally {
      this.checkQueuesRunning = false;
    }
  }

  /**
   * Stale BR room cleanup on its own slower interval (every 60s).
   */
  @Interval(BOT_STALE_CLEANUP_INTERVAL_MS)
  async cleanupStaleRooms(): Promise<void> {
    if (this._paused) return;
    await this.cleanStaleBRRooms();
  }

  /**
   * Quick count check: are there any queued online games, waiting duels,
   * or waiting BR rooms? Returns true if any queue has work.
   */
  private async hasQueuedWork(): Promise<boolean> {
    const [online, duel, br] = await Promise.all([
      this.supabaseService.client
        .from('online_games')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .is('guest_id', null),
      this.supabaseService.client
        .from('duel_games')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'waiting')
        .is('guest_id', null),
      this.supabaseService.client
        .from('battle_royale_rooms')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'waiting')
        .eq('is_private', false),
    ]);

    // Fail open: if any query errored, assume there's work to do
    if (online.error || duel.error || br.error) {
      this.logger.warn('Queue count check failed — assuming work exists');
      return true;
    }

    return (online.count ?? 0) + (duel.count ?? 0) + (br.count ?? 0) > 0;
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
        this.logger.warn(`Online game ${game.id} bot inject failed: ${err}`);
      });
    }
  }

  private async matchBotForOnlineGame(gameId: string, hostId: string): Promise<void> {
    const hostProfile = await this.supabaseService.getProfile(hostId);
    const playerElo = hostProfile?.elo ?? 1000;

    const bot = await this.botService.selectBot(playerElo);
    if (!bot) {
      this.logger.warn(`No bot available for online game ${gameId}`);
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
      this.logger.warn(`Failed to inject bot into online game ${gameId}: ${error.message}`);
      return;
    }

    this.logger.debug(`Bot "${bot.username}" matched into online game ${gameId}`);
  }

  // ── Duel ────────────────────────────────────────────────────────────────────

  private async injectBotsIntoDuelQueues(): Promise<void> {
    const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_SECONDS * 1000).toISOString();

    // Fill BOTH standard and logo duel queues. The bot runner is generic
    // (reads questions[index].correct_answer which the duel service
    // populates correctly for either game_type), and logo duel answer
    // validation uses fuzzyMatch which accepts the exact team_name the
    // bot submits. For bot skill matching we prefer logo_quiz_elo on
    // logo duels so the matchup is fair to the player's logo tier.
    const { data: games, error } = await this.supabaseService.client
      .from('duel_games')
      .select('id, host_id, game_type')
      .eq('status', 'waiting')
      .in('game_type', ['standard', 'logo'])
      .is('invite_code', null)
      .is('guest_id', null)
      .lt('created_at', cutoff)
      .limit(5);

    if (error || !games || games.length === 0) return;

    for (const game of games) {
      const gameType = (game as { game_type?: string }).game_type === 'logo' ? 'logo' : 'standard';
      await this.matchBotForDuel(game.id, game.host_id, gameType).catch((err) => {
        this.logger.warn(`Duel ${game.id} (${gameType}) bot inject failed: ${err}`);
      });
    }
  }

  private async matchBotForDuel(
    gameId: string,
    hostId: string,
    gameType: 'standard' | 'logo' = 'standard',
  ): Promise<void> {
    const hostProfile = await this.supabaseService.getProfile(hostId);
    // Match bot skill against the player's tier IN THIS MODE. Logo and
    // solo ELOs often diverge significantly (a player can be Challenger
    // solo but Iron logo), so using the wrong one produces mismatched
    // bots for one mode.
    const playerElo = gameType === 'logo'
      ? (hostProfile?.logo_quiz_elo ?? 1000)
      : (hostProfile?.elo ?? 1000);

    const bot = await this.botService.selectBot(playerElo);
    if (!bot) {
      this.logger.warn(`No bot available for duel ${gameId} (${gameType})`);
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
      this.logger.warn(`Failed to inject bot into duel ${gameId}: ${error?.message}`);
      return;
    }

    this.logger.debug(`Bot "${bot.username}" matched into ${gameType} duel ${gameId}`);
    this.duelRunner.runDuelBot(gameId, bot.id, bot.bot_skill);
  }

  // ── Battle Royale ───────────────────────────────────────────────────────────

  private async injectBotsIntoBattleRoyaleRooms(): Promise<void> {
    const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_SECONDS * 1000).toISOString();

    const { data: rooms, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, host_id')
      .eq('status', 'waiting')
      .eq('mode', 'classic')
      .lt('created_at', cutoff)
      .limit(5);

    if (error || !rooms || rooms.length === 0) return;

    for (const room of rooms) {
      await this.fillAndStartBRRoom(room.id, room.host_id).catch((err) => {
        this.logger.warn(`BR room ${room.id} bot fill failed: ${err}`);
      });
    }
  }

  private async fillAndStartBRRoom(roomId: string, hostId: string): Promise<void> {
    // Count real players already in the room
    const { count: playerCount } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('id', { count: 'exact', head: true })
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
      this.logger.warn(`No bots available for BR room ${roomId}`);
      return;
    }

    // Add each bot as a player in the room
    for (const bot of bots) {
      await this.brService.addBotToRoom(roomId, bot.id, bot.username).catch((err) => {
        this.logger.warn(`Could not add bot ${bot.id} to BR room ${roomId}: ${err}`);
      });
    }

    // Force-start the room
    await this.brService.forceStartRoom(roomId);

    this.logger.debug(`Started BR room ${roomId} with ${bots.length} bots (${realPlayers} real player(s))`);

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
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waiting')
      .eq('is_private', false)
      .eq('mode', 'classic');

    if (error) {
      this.logger.warn(`Could not count waiting BR rooms: ${error.message}`);
      return;
    }

    const waiting = count ?? 0;
    if (waiting >= BR_MIN_WAITING_ROOMS) return;

    const roomsToCreate = BR_MIN_WAITING_ROOMS - waiting;
    this.logger.debug(`Only ${waiting} waiting BR room(s) — creating ${roomsToCreate} bot-hosted room(s)`);

    for (let i = 0; i < roomsToCreate; i++) {
      await this.createOneBotBRRoom().catch((err) => {
        this.logger.warn(`Failed to create bot BR room: ${err}`);
      });
    }
  }

  private async createOneBotBRRoom(): Promise<void> {
    // Pick the host bot at average skill
    const hostBot = await this.botService.selectBot(1000);
    if (!hostBot) {
      this.logger.warn('No host bot available to create BR room');
      return;
    }

    const { roomId } = await this.brService.createRoomForBot(hostBot.id, hostBot.username);
    this.logger.debug(`Bot "${hostBot.username}" created BR room ${roomId}`);

    // Seed the room with additional bots so it looks lively in the lobby
    const seedBots = await this.botService.selectBotsForRoom(BR_SEED_BOT_COUNT, 1000);
    for (const bot of seedBots) {
      if (bot.id === hostBot.id) continue; // host is already in the room
      await this.brService.addBotToRoom(roomId, bot.id, bot.username).catch((err) => {
        this.logger.warn(`Could not seed bot ${bot.id} into new BR room ${roomId}: ${err}`);
      });
    }

    this.logger.debug(`BR room ${roomId} seeded with ${seedBots.length} bot(s) — waiting for humans`);
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
      this.logger.warn(`Stale BR room cleanup failed: ${error.message}`);
    }
  }
}
