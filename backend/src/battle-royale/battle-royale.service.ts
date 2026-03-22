import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { BlitzService } from '../blitz/blitz.service';
import { BlitzQuestion } from '../blitz/blitz.types';
import {
  BRRoomRow,
  BRPlayerRow,
  BRPublicView,
  BRPublicQuestion,
  BRAnswerResult,
  BRPlayerEntry,
} from './battle-royale.types';

const QUESTION_COUNT = 20;
const POINTS_PER_CORRECT = 100;
const ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class BattleRoyaleService {
  private readonly logger = new Logger(BattleRoyaleService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly blitzService: BlitzService,
  ) {}

  // ── Create room ─────────────────────────────────────────────────────────────

  async createRoom(hostId: string, hostUsername: string, isPrivate = true): Promise<{ roomId: string; inviteCode: string }> {
    const questions = await this.blitzService.drawForRoom(QUESTION_COUNT);
    if (questions.length === 0) {
      throw new BadRequestException('No questions available in the pool');
    }

    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

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

    await this.addPlayer(room.id, hostId, hostUsername);
    return { roomId: room.id, inviteCode };
  }

  // ── Join by invite code ─────────────────────────────────────────────────────

  async joinByCode(userId: string, username: string, inviteCode: string): Promise<{ roomId: string }> {
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

  async joinQueue(userId: string, username: string): Promise<{ roomId: string; isHost: boolean }> {
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

    const me = players.find((p) => p.user_id === requestingUserId);
    const myIndex = me?.current_question_index ?? 0;

    const playerEntries: BRPlayerEntry[] = players.map((p, i) => ({
      userId: p.user_id,
      username: p.username,
      score: p.score,
      currentQuestionIndex: p.current_question_index,
      finished: !!p.finished_at,
      rank: i + 1,
    }));

    let currentQuestion: BRPublicQuestion | null = null;
    if (room.status === 'active' && me && myIndex < room.questions.length) {
      currentQuestion = this.toPublicQuestion(room.questions[myIndex], myIndex);
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
    };
  }

  // ── Start room (host only) ───────────────────────────────────────────────────

  async startRoom(roomId: string, requestingUserId: string): Promise<void> {
    const { data: room, error } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .select('id, host_id, status')
      .eq('id', roomId)
      .single<Pick<BRRoomRow, 'id' | 'host_id' | 'status'>>();

    if (error || !room) throw new NotFoundException('Room not found');
    if (room.host_id !== requestingUserId) throw new ForbiddenException('Only the host can start the game');
    if (room.status !== 'waiting') throw new BadRequestException('Room is not in waiting state');

    const { error: updateErr } = await this.supabaseService.client
      .from('battle_royale_rooms')
      .update({ status: 'active', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', roomId);

    if (updateErr) throw new BadRequestException('Could not start room');

    // Set question_started_at for all players so the first question timer begins
    await this.supabaseService.client
      .from('battle_royale_players')
      .update({ question_started_at: new Date().toISOString() })
      .eq('room_id', roomId);

    // Schedule auto-finish
    setTimeout(() => this.autoFinishRoom(roomId), ROOM_TIMEOUT_MS);
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
        .select('id, status, questions, question_count')
        .eq('id', roomId)
        .single<Pick<BRRoomRow, 'id' | 'status' | 'questions' | 'question_count'>>(),
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

    const question = room.questions[questionIndex] as BlitzQuestion;
    if (!question) throw new BadRequestException('Question not found');

    const normalise = (s: string) => s.toLowerCase().trim();
    const correct = normalise(answer) === normalise(question.correct_answer);
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
        correct_answer: question.correct_answer,
        myScore: player.score,
        nextQuestion: null,
        finished: !!player.finished_at,
        pointsAwarded: 0,
        timeBonus: 0,
      };
    }

    // Check if all players are done
    if (isLastQuestion) {
      await this.checkAndFinishRoom(roomId);
    }

    const nextQuestion =
      !isLastQuestion && room.questions[newIndex]
        ? this.toPublicQuestion(room.questions[newIndex] as BlitzQuestion, newIndex)
        : null;

    return {
      correct,
      correct_answer: question.correct_answer,
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

  private async addPlayer(roomId: string, userId: string, username: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('battle_royale_players')
      .upsert({ room_id: roomId, user_id: userId, username }, { onConflict: 'room_id,user_id' });

    if (error) {
      this.logger.error(`[br] addPlayer error: ${error.message}`);
      throw new BadRequestException('Could not join room');
    }
  }

  private toPublicQuestion(q: BlitzQuestion, index: number): BRPublicQuestion {
    return {
      index,
      question_text: q.question_text,
      choices: q.choices,
      category: q.category,
      difficulty: q.difficulty,
      meta: q.meta as BRPublicQuestion['meta'],
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
