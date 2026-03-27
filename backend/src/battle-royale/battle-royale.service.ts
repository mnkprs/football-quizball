import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { BlitzService } from '../blitz/blitz.service';
import { BlitzQuestion } from '../blitz/blitz.types';
import { LogoQuizService } from '../logo-quiz/logo-quiz.service';
import {
  BRRoomRow,
  BRPlayerRow,
  BRPublicView,
  BRPublicQuestion,
  BRAnswerResult,
  BRPlayerEntry,
  BRLogoPlayerQuestion,
} from './battle-royale.types';

const QUESTION_COUNT = 10;
const POINTS_PER_CORRECT = 100;
const ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class BattleRoyaleService {
  private readonly logger = new Logger(BattleRoyaleService.name);
  private roomsCache: { data: { id: string; inviteCode: string; playerCount: number; maxPlayers: number; createdAt: string; hostUsername: string }[]; expiresAt: number } | null = null;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly blitzService: BlitzService,
    private readonly logoQuizService: LogoQuizService,
  ) {}

  // ── Create room ─────────────────────────────────────────────────────────────

  async createRoom(hostId: string, hostUsername?: string, isPrivate = true): Promise<{ roomId: string; inviteCode: string }> {
    const questions = await this.blitzService.drawForRoom(QUESTION_COUNT);
    if (questions.length === 0) {
      throw new BadRequestException('No questions available in the pool');
    }

    const inviteCode = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

    const { data: room, error: roomErr } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .insert({
        host_id: hostId,
        invite_code: inviteCode,
        status: 'waiting',
        questions,
        question_count: questions.length,
        is_private: isPrivate,
      })
      .select()
      .single<BRRoomRow>();

    if (roomErr || !room) {
      this.logger.error(`[br] createRoom error: ${roomErr?.message}`);
      throw new BadRequestException('Could not create room');
    }

    await this.addPlayer(room.id, hostId, hostUsername); // standard mode — no mode hint needed
    return { roomId: room.id, inviteCode };
  }

  // ── Create team logo room ────────────────────────────────────────────────────

  async createTeamLogoRoom(hostId: string, hostUsername?: string): Promise<{ roomId: string; inviteCode: string }> {
    const inviteCode = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

    const { data: room, error: roomErr } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .insert({
        host_id: hostId,
        invite_code: inviteCode,
        status: 'waiting',
        questions: [],        // questions are per-player for team_logo, not on the room
        question_count: 10,
        is_private: true,     // friends-only for v1
        mode: 'team_logo',
        config: { teamCount: 2, questionCount: 10, timerSeconds: 45 },
      })
      .select()
      .single<BRRoomRow>();

    if (roomErr || !room) {
      this.logger.error(`[br] createTeamLogoRoom error: ${roomErr?.message}`);
      throw new BadRequestException('Could not create team logo room');
    }

    await this.addPlayer(room.id, hostId, hostUsername, 'team_logo'); // mode known — skip extra query
    return { roomId: room.id, inviteCode };
  }

  // ── Join by invite code ─────────────────────────────────────────────────────

  async joinByCode(userId: string, username: string | undefined, inviteCode: string): Promise<{ roomId: string }> {
    const { data: room, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select()
      .eq('invite_code', inviteCode.toUpperCase())
      .single<BRRoomRow>();

    if (error || !room) throw new NotFoundException('Room not found');
    if (room.status !== 'waiting') throw new BadRequestException('Room is no longer accepting players');

    await this.addPlayer(room.id, userId, username);
    return { roomId: room.id };
  }

  // ── Join queue (find or create waiting room) ────────────────────────────────

  async joinQueue(userId: string, username?: string): Promise<{ roomId: string; isHost: boolean }> {
    // Look for an open waiting public room
    const { data: rooms } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, host_id')
      .eq('status', 'waiting')
      .eq('is_private', false)
      .limit(5);

    // Check if user is already in a room
    if (rooms && rooms.length > 0) {
      for (const r of rooms) {
        const { data: existing } = await this.supabaseService.client
          .from('battle_royale_players')
          .select('id')
          .eq('room_id', r.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!existing) {
          // Not in this room yet — check capacity (max 20)
          const { count } = await this.supabaseService.client
            .from('battle_royale_players')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', r.id);

          if ((count ?? 0) < 20) {
            await this.addPlayer(r.id, userId, username);
            return { roomId: r.id, isHost: false };
          }
        } else {
          return { roomId: r.id, isHost: r.host_id === userId };
        }
      }
    }

    // No suitable room found — create a public one
    const { roomId } = await this.createRoom(userId, username, false);
    return { roomId, isHost: true };
  }

  // ── Get public waiting rooms ─────────────────────────────────────────────────

  async getPublicRooms(): Promise<{
    id: string;
    inviteCode: string;
    playerCount: number;
    maxPlayers: number;
    createdAt: string;
    hostUsername: string;
  }[]> {
    // Serve from cache if still fresh (5-second TTL)
    const now = Date.now();
    if (this.roomsCache && this.roomsCache.expiresAt > now) {
      return this.roomsCache.data;
    }

    // Query 1: fetch waiting public rooms
    const { data: rooms, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, invite_code, host_id, created_at')
      .eq('status', 'waiting')
      .eq('is_private', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !rooms || rooms.length === 0) return [];

    const typedRooms = rooms as { id: string; invite_code: string; host_id: string; created_at: string }[];
    const roomIds = typedRooms.map((r) => r.id);
    const hostIds = [...new Set(typedRooms.map((r) => r.host_id))];

    // Query 2: batch-fetch all player rows for these rooms in one round-trip
    const { data: playerRows } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('room_id')
      .in('room_id', roomIds);

    const countMap = new Map<string, number>();
    for (const row of (playerRows ?? []) as { room_id: string }[]) {
      countMap.set(row.room_id, (countMap.get(row.room_id) ?? 0) + 1);
    }

    // Query 3: batch-fetch all host profiles in one round-trip
    const { data: profiles } = await this.supabaseService.client
      .from('profiles')
      .select('id, username')
      .in('id', hostIds);

    const profileMap = new Map<string, string>();
    for (const p of (profiles ?? []) as { id: string; username: string | null }[]) {
      profileMap.set(p.id, p.username ?? 'Unknown');
    }

    const result = typedRooms.map((room) => ({
      id: room.id,
      inviteCode: room.invite_code,
      playerCount: countMap.get(room.id) ?? 0,
      maxPlayers: 20,
      createdAt: room.created_at,
      hostUsername: profileMap.get(room.host_id) ?? 'Unknown',
    }));

    // Cache the result for 5 seconds
    this.roomsCache = { data: result, expiresAt: now + 5_000 };
    return result;
  }

  // ── Get room (public view, correct answers stripped) ────────────────────────

  async getRoom(roomId: string, requestingUserId: string): Promise<BRPublicView> {
    const [roomResult, playersResult] = await Promise.all([
      this.supabaseService.client
        .from('battle_royale_rooms')
        .select()
        .eq('id', roomId)
        .single<BRRoomRow>(),
      this.supabaseService.client
        .from('battle_royale_players')
        .select()
        .eq('room_id', roomId)
        .order('score', { ascending: false }),
    ]);

    if (roomResult.error || !roomResult.data) throw new NotFoundException('Room not found');

    const room = roomResult.data;
    const players = (playersResult.data ?? []) as BRPlayerRow[];
    const isTeamLogoMode = room.mode === 'team_logo';

    const me = players.find((p) => p.user_id === requestingUserId);
    const myIndex = me?.current_question_index ?? 0;

    const playerEntries: BRPlayerEntry[] = players.map((p, i) => ({
      userId: p.user_id,
      username: p.username,
      score: p.score,
      currentQuestionIndex: p.current_question_index,
      finished: !!p.finished_at,
      rank: i + 1,
      ...(isTeamLogoMode && { teamId: p.team_id ?? undefined }),
    }));

    // Build the current question for the requesting player
    let currentQuestion: BRPublicQuestion | null = null;
    if (room.status === 'active' && me) {
      if (isTeamLogoMode) {
        const logoQ = (me.player_questions ?? [])[myIndex];
        if (logoQ) {
          currentQuestion = {
            index: myIndex,
            question_text: 'Identify this football club from its logo',
            choices: [],
            category: 'LOGO_QUIZ',
            difficulty: logoQ.difficulty,
            image_url: logoQ.image_url,
            original_image_url: logoQ.original_image_url,
            meta: logoQ.meta as BRPublicQuestion['meta'],
          };
        }
      } else if (myIndex < room.questions.length) {
        currentQuestion = this.toPublicQuestion(room.questions[myIndex], myIndex);
      }
    }

    // Compute team scores for team_logo rooms
    let teamScores: BRPublicView['teamScores'];
    if (isTeamLogoMode) {
      const team1Players = players.filter((p) => p.team_id === 1);
      const team2Players = players.filter((p) => p.team_id === 2);
      const sum = (arr: BRPlayerRow[]) => arr.reduce((acc, p) => acc + p.score, 0);
      const team1Total = sum(team1Players);
      const team2Total = sum(team2Players);
      teamScores = {
        team1: team1Total,
        team2: team2Total,
        team1Avg: team1Players.length > 0 ? team1Total / team1Players.length : 0,
        team2Avg: team2Players.length > 0 ? team2Total / team2Players.length : 0,
      };
    }

    // Compute MVP when the game is finished (player with the highest individual score)
    let mvp: BRPublicView['mvp'];
    if (isTeamLogoMode && room.status === 'finished' && players.length > 0) {
      const top = players.reduce((best, p) => (p.score > best.score ? p : best), players[0]);
      mvp = { userId: top.user_id, username: top.username, score: top.score };
    }

    return {
      id: room.id,
      status: room.status,
      inviteCode: room.invite_code,
      hostId: room.host_id,
      isHost: room.host_id === requestingUserId,
      isPrivate: room.is_private,
      myUserId: requestingUserId,
      questionCount: room.question_count,
      players: playerEntries,
      currentQuestion,
      myCurrentIndex: myIndex,
      startedAt: room.started_at,
      ...(isTeamLogoMode && { mode: room.mode, teamScores, mvp }),
    };
  }

  // ── Start room (host only) ───────────────────────────────────────────────────

  async startRoom(roomId: string, requestingUserId: string): Promise<void> {
    const { data: room, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, host_id, status, mode, config')
      .eq('id', roomId)
      .single<Pick<BRRoomRow, 'id' | 'host_id' | 'status' | 'mode' | 'config'>>();

    if (error || !room) throw new NotFoundException('Room not found');
    if (room.host_id !== requestingUserId) throw new ForbiddenException('Only the host can start the game');
    if (room.status !== 'waiting') throw new BadRequestException('Room is not in waiting state');

    // CAS guard: atomically transition waiting → active. If another concurrent
    // startRoom call already flipped the status, data will be empty and we bail out,
    // preventing dealLogoQuestions from running twice.
    const { data: casRows, error: updateErr } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .update({ status: 'active', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('status', 'waiting')  // CAS: only succeeds for the first caller
      .select('id');

    if (updateErr) throw new BadRequestException('Could not start room');
    if (!casRows || casRows.length === 0) {
      // A concurrent startRoom call won the race — room is already active, do nothing.
      return;
    }

    // Deal per-player logo questions now that we exclusively own the transition.
    if (room.mode === 'team_logo') {
      // Rebalance team assignments (Finding 2): concurrent joins may have produced
      // unbalanced teams. Re-assign by join order (alternating 1/2) before dealing.
      await this.rebalanceTeams(roomId);
      await this.dealLogoQuestions(roomId, room.config?.questionCount ?? QUESTION_COUNT);
    }

    // Set question_started_at for all players so the first question timer begins
    await this.supabaseService.client
      .from('battle_royale_players')
      .update({ question_started_at: new Date().toISOString() })
      .eq('room_id', roomId);

    // Schedule auto-finish
    setTimeout(() => this.autoFinishRoom(roomId), ROOM_TIMEOUT_MS);
  }

  // ── Deal logo questions to each player (team_logo mode) ──────────────────────

  private async dealLogoQuestions(roomId: string, questionCount: number): Promise<void> {
    const { data: playerRows } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('id, user_id')
      .eq('room_id', roomId);

    const players = (playerRows ?? []) as { id: string; user_id: string }[];
    if (players.length === 0) return;

    const totalNeeded = questionCount * players.length;
    const logos = await this.logoQuizService.drawLogosForTeamMode(totalNeeded);

    if (logos.length < totalNeeded) {
      this.logger.warn(
        `[br] dealLogoQuestions: requested ${totalNeeded} logos but only got ${logos.length}; proceeding with available`,
      );
    }

    // Round-robin deal: for each round, assign one logo to each player in order.
    // Player i gets logos at positions [i, i + playerCount, i + 2*playerCount, ...]
    const playerCount = players.length;
    const updates: Array<Promise<void>> = players.map(async (player, playerIdx) => {
      const questions: BRLogoPlayerQuestion[] = [];
      for (let round = 0; round < questionCount; round++) {
        const logoIdx = round * playerCount + playerIdx;
        const logo = logos[logoIdx];
        if (!logo) break; // guard: insufficient pool
        questions.push({
          index: round,
          question_id: logo.id,
          correct_answer: logo.correct_answer,
          image_url: logo.image_url,
          original_image_url: logo.original_image_url,
          difficulty: logo.difficulty,
          meta: logo.meta,
        });
      }

      const { error } = await this.supabaseService.client
        .from('battle_royale_players')
        .update({ player_questions: questions, updated_at: new Date().toISOString() })
        .eq('id', player.id);

      if (error) {
        this.logger.error(`[br] dealLogoQuestions update error for player ${player.user_id}: ${error.message}`);
      }
    });

    await Promise.all(updates);
  }

  // ── Submit answer ────────────────────────────────────────────────────────────

  async submitAnswer(
    roomId: string,
    userId: string,
    questionIndex: number,
    answer: string,
  ): Promise<BRAnswerResult> {
    const [roomResult, playerResult] = await Promise.all([
      this.supabaseService.client
        .from('battle_royale_rooms')
        .select('id, status, questions, question_count, mode')
        .eq('id', roomId)
        .single<Pick<BRRoomRow, 'id' | 'status' | 'questions' | 'question_count' | 'mode'>>(),
      this.supabaseService.client
        .from('battle_royale_players')
        .select()
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single<BRPlayerRow>(),
    ]);

    if (roomResult.error || !roomResult.data) throw new NotFoundException('Room not found');
    if (playerResult.error || !playerResult.data) throw new ForbiddenException('You are not in this room');

    const room = roomResult.data;
    const player = playerResult.data;

    if (room.status !== 'active') throw new BadRequestException('Game is not active');
    if (player.finished_at) throw new BadRequestException('You have already finished');
    if (player.current_question_index !== questionIndex) {
      throw new BadRequestException('Stale question index');
    }

    const isTeamLogoMode = room.mode === 'team_logo';

    // For team_logo rooms, questions live on the player row; standard rooms use room.questions.
    let correctAnswer: string;
    if (isTeamLogoMode) {
      const logoQuestion = (player.player_questions ?? [])[questionIndex];
      if (!logoQuestion) throw new BadRequestException('Question not found');
      correctAnswer = logoQuestion.correct_answer;
    } else {
      const question = room.questions[questionIndex] as BlitzQuestion;
      if (!question) throw new BadRequestException('Question not found');
      correctAnswer = question.correct_answer;
    }

    const correct = isTeamLogoMode
      ? this.logoQuizService.fuzzyMatch(answer, correctAnswer)
      : (() => {
          const normalise = (s: string) => s.toLowerCase().trim();
          return normalise(answer) === normalise(correctAnswer);
        })();

    const newIndex = questionIndex + 1;
    const isLastQuestion = newIndex >= room.question_count;

    const secondsTaken = player.question_started_at
      ? (Date.now() - new Date(player.question_started_at).getTime()) / 1000
      : 30;
    const timeBonus = correct ? Math.max(0, Math.round(50 * (1 - secondsTaken / 30))) : 0;
    const pointsAwarded = correct ? POINTS_PER_CORRECT + timeBonus : 0;
    const newScore = player.score + pointsAwarded;

    const playerUpdate: Partial<BRPlayerRow> = {
      score: newScore,
      current_question_index: newIndex,
      question_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as Partial<BRPlayerRow>;

    if (isLastQuestion) {
      (playerUpdate as unknown as Record<string, string>).finished_at = new Date().toISOString();
    }

    // CAS: only update if current_question_index still matches what we read.
    // Prevents a duplicate simultaneous request from double-scoring.
    const { data: casResult } = await this.supabaseService.client
      .from('battle_royale_players')
      .update(playerUpdate)
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .eq('current_question_index', questionIndex)  // CAS guard
      .select('id');

    if (!casResult || casResult.length === 0) {
      // Duplicate submission — index already advanced, return idempotent result
      return {
        correct,
        correct_answer: correctAnswer,
        myScore: player.score,
        nextQuestion: null,
        finished: !!player.finished_at,
        pointsAwarded: 0,
        timeBonus: 0,
      };
    }

    // Check if all players are done and record match history for this player
    if (isLastQuestion) {
      await this.checkAndFinishRoom(roomId);
      // Force-finish room 30s after any player completes, in case bots stall
      setTimeout(() => this.autoFinishRoom(roomId), 30_000);
      this.supabaseService.saveMatchResult({
        player1_id: userId,
        player2_id: null,
        player1_username: player.username,
        player2_username: isTeamLogoMode ? 'Team Logo Battle' : 'Battle Royale',
        winner_id: null,
        player1_score: newScore,
        player2_score: 0,
        match_mode: isTeamLogoMode ? 'team_logo_battle' : 'battle_royale',
      }).catch((e) => this.logger.warn(`[br] match history save failed: ${e?.message}`));
    }

    // Build the next question reference depending on mode
    let nextQuestion: BRPublicQuestion | null = null;
    if (!isLastQuestion) {
      if (isTeamLogoMode) {
        const nextLogoQ = (player.player_questions ?? [])[newIndex];
        if (nextLogoQ) {
          nextQuestion = {
            index: newIndex,
            question_text: 'Identify this football club from its logo',
            choices: [],
            category: 'LOGO_QUIZ',
            difficulty: nextLogoQ.difficulty,
            image_url: nextLogoQ.image_url,
            original_image_url: nextLogoQ.original_image_url,
            meta: nextLogoQ.meta as BRPublicQuestion['meta'],
          };
        }
      } else if (room.questions[newIndex]) {
        nextQuestion = this.toPublicQuestion(room.questions[newIndex] as BlitzQuestion, newIndex);
      }
    }

    return {
      correct,
      correct_answer: correctAnswer,
      myScore: newScore,
      nextQuestion,
      finished: isLastQuestion,
      pointsAwarded,
      timeBonus,
    };
  }

  // ── Get leaderboard ──────────────────────────────────────────────────────────

  async getLeaderboard(roomId: string): Promise<BRPlayerEntry[]> {
    const { data, error } = await this.supabaseService.client
      .from('battle_royale_players')
      .select()
      .eq('room_id', roomId)
      .order('score', { ascending: false });

    if (error) throw new NotFoundException('Room not found');
    return ((data ?? []) as BRPlayerRow[]).map((p, i) => ({
      userId: p.user_id,
      username: p.username,
      score: p.score,
      currentQuestionIndex: p.current_question_index,
      finished: !!p.finished_at,
      rank: i + 1,
    }));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Add a bot (or any participant) to a room by ID — used by the bot matchmaker. */
  async addBotToRoom(roomId: string, botId: string, botUsername: string): Promise<void> {
    await this.addPlayer(roomId, botId, botUsername);
  }

  /**
   * Create a public waiting room hosted by a bot user.
   * Unlike createRoom (which defaults to private), this always sets is_private=false
   * so the room appears in the lobby list for humans to join.
   */
  async createRoomForBot(botId: string, botUsername: string): Promise<{ roomId: string; inviteCode: string }> {
    const questions = await this.blitzService.drawForRoom(QUESTION_COUNT);
    if (questions.length === 0) {
      throw new BadRequestException('No questions available in the pool');
    }

    const inviteCode = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

    const { data: room, error: roomErr } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .insert({
        host_id: botId,
        invite_code: inviteCode,
        status: 'waiting',
        questions,
        question_count: questions.length,
        is_private: false, // always public so humans can discover and join
      })
      .select()
      .single<BRRoomRow>();

    if (roomErr || !room) {
      this.logger.error(`[br] createRoomForBot error: ${roomErr?.message}`);
      throw new BadRequestException('Could not create bot room');
    }

    await this.addPlayer(room.id, botId, botUsername); // standard mode — no mode hint needed
    return { roomId: room.id, inviteCode };
  }

  /** Remove a player from a waiting room; deletes the room if it becomes empty. */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const { data: room, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, host_id, status')
      .eq('id', roomId)
      .single<Pick<BRRoomRow, 'id' | 'host_id' | 'status'>>();

    if (error || !room) throw new NotFoundException('Room not found');
    if (room.status !== 'waiting') throw new BadRequestException('Cannot leave a room that has already started');

    await this.supabaseService.client
      .from('battle_royale_players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    const { data: remaining } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('user_id')
      .eq('room_id', roomId);

    if (!remaining || remaining.length === 0) {
      await this.supabaseService.client
        .from('battle_royale_rooms')
        .delete()
        .eq('id', roomId);
      return;
    }

    if (room.host_id === userId) {
      const newHostId = (remaining as { user_id: string }[])[0].user_id;
      await this.supabaseService.client
        .from('battle_royale_rooms')
        .update({ host_id: newHostId, updated_at: new Date().toISOString() })
        .eq('id', roomId);
    }
  }

  /** Programmatically start a room — used by the bot matchmaker for auto-start. */
  async forceStartRoom(roomId: string): Promise<void> {
    const { data: room, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, host_id, status')
      .eq('id', roomId)
      .single<Pick<BRRoomRow, 'id' | 'host_id' | 'status'>>();

    if (error || !room || room.status !== 'waiting') return;
    await this.startRoom(roomId, room.host_id);
  }

  /**
   * Add (or upsert) a player into a room.
   *
   * @param mode - Optional room mode. When known by the caller (e.g. 'team_logo'),
   *   pass it here to avoid an extra DB round-trip (Finding 6 N+1 fix).
   *   If omitted, the method queries the room row itself (e.g. joinByCode path).
   */
  private async addPlayer(roomId: string, userId: string, usernameHint?: string, mode?: string): Promise<void> {
    let username = usernameHint;
    if (!username) {
      const profile = await this.supabaseService.getProfile(userId);
      username = profile?.username ?? 'Player';
    }

    // Resolve the room mode — use the caller-supplied value when available to
    // skip the extra SELECT (Finding 6: N+1 reduction).
    let resolvedMode = mode;
    if (!resolvedMode) {
      const { data: roomRow } = await this.supabaseService.client
        .from('battle_royale_rooms')
        .select('mode')
        .eq('id', roomId)
        .single<Pick<BRRoomRow, 'mode'>>();
      resolvedMode = roomRow?.mode ?? undefined;
    }

    // For team_logo rooms, auto-assign team_id by balancing player counts across teams.
    // Note: a definitive rebalance is applied in startRoom() to handle any races.
    let teamId: number | undefined;
    if (resolvedMode === 'team_logo') {
      const { data: existingPlayers } = await this.supabaseService.client
        .from('battle_royale_players')
        .select('team_id')
        .eq('room_id', roomId);

      const rows = (existingPlayers ?? []) as { team_id: number | null }[];
      const team1Count = rows.filter((p) => p.team_id === 1).length;
      const team2Count = rows.filter((p) => p.team_id === 2).length;
      // Assign to whichever team has fewer players; break ties by defaulting to team 1
      teamId = team1Count <= team2Count ? 1 : 2;
    }

    const payload: Record<string, unknown> = { room_id: roomId, user_id: userId, username };
    if (teamId !== undefined) {
      payload.team_id = teamId;
    }

    const { error } = await this.supabaseService.client
      .from('battle_royale_players')
      .upsert(payload, { onConflict: 'room_id,user_id' });

    if (error) {
      this.logger.error(`[br] addPlayer error: ${error.message}`);
      throw new BadRequestException('Could not join room');
    }
  }

  /**
   * Rebalance team assignments for a team_logo room before the game starts.
   * Sorts players by their row insertion order (joined_at or id) and assigns
   * alternating team IDs (1, 2, 1, 2, …) to guarantee equal-or-near-equal splits
   * regardless of any concurrent-join races during the lobby phase.
   */
  private async rebalanceTeams(roomId: string): Promise<void> {
    const { data: playerRows } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('id, user_id')
      .eq('room_id', roomId)
      .order('id', { ascending: true }); // stable insertion order

    const players = (playerRows ?? []) as { id: string; user_id: string }[];
    if (players.length === 0) return;

    const updates = players.map(async (player, idx) => {
      const teamId = (idx % 2) + 1; // alternates 1, 2, 1, 2, …
      const { error } = await this.supabaseService.client
        .from('battle_royale_players')
        .update({ team_id: teamId, updated_at: new Date().toISOString() })
        .eq('id', player.id);
      if (error) {
        this.logger.warn(`[br] rebalanceTeams: failed to update player ${player.user_id}: ${error.message}`);
      }
    });

    await Promise.all(updates);
    this.logger.log(`[br] rebalanceTeams: assigned teams for ${players.length} players in room ${roomId}`);
  }

  private toPublicQuestion(q: BlitzQuestion, index: number): BRPublicQuestion {
    return {
      index,
      question_text: q.question_text,
      choices: q.choices,
      category: q.category,
      difficulty: q.difficulty,
      meta: (q.meta ?? {}) as BRPublicQuestion['meta'],
    };
  }

  private async checkAndFinishRoom(roomId: string): Promise<void> {
    const { data: players } = await this.supabaseService.client
      .from('battle_royale_players')
      .select('finished_at')
      .eq('room_id', roomId);

    const allDone = (players ?? []).every((p: { finished_at: string | null }) => !!p.finished_at);
    if (allDone) {
      await this.supabaseService.client
        .from('battle_royale_rooms')
        .update({ status: 'finished', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', roomId);
    }
  }

  private async autoFinishRoom(roomId: string): Promise<void> {
    const { data: room } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('status')
      .eq('id', roomId)
      .single<Pick<BRRoomRow, 'status'>>();

    if (room?.status === 'active') {
      this.logger.log(`[br] Auto-finishing room ${roomId} after timeout`);
      await this.supabaseService.client
        .from('battle_royale_rooms')
        .update({ status: 'finished', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', roomId);
    }
  }
}
