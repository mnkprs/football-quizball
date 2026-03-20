import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { GeneratedQuestion } from '../questions/question.types';
import {
  CreateDuelDto,
  JoinDuelByCodeDto,
  DuelAnswerDto,
  DuelPublicView,
  DuelPublicQuestion,
  DuelAnswerResult,
  DuelGameSummary,
  DuelGameRow,
  DuelQuestionResult,
} from './duel.types';

/** First to WIN_TARGET correct answers wins the duel */
const WIN_TARGET = 5;
/** Questions pre-drawn at creation to avoid mid-game latency */
const PREFETCH_COUNT = 30;

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

@Injectable()
export class DuelService {
  private readonly logger = new Logger(DuelService.name);

  constructor(
    private supabaseService: SupabaseService,
    private questionPoolService: QuestionPoolService,
    private answerValidator: AnswerValidator,
  ) {}

  // ── Create / Join ─────────────────────────────────────────────────────────

  async createGame(hostId: string, dto: CreateDuelDto): Promise<DuelPublicView> {
    const language = dto.language ?? 'en';
    const questions = await this.questionPoolService.drawForDuel(language, PREFETCH_COUNT);
    if (questions.length === 0) {
      throw new BadRequestException('Question pool is empty. Please try again later.');
    }

    const inviteCode = generateInviteCode();
    const poolQuestionIds = questions.map((q) => q.id);

    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .insert({
        host_id: hostId,
        invite_code: inviteCode,
        questions,
        pool_question_ids: poolQuestionIds,
        language,
        status: 'waiting',
      })
      .select('*')
      .single();

    if (error) throw new BadRequestException(`Failed to create duel: ${error.message}`);

    const hostUsername = await this.getUsername(hostId);
    return this.toPublicView(data as DuelGameRow, hostId, hostUsername, null);
  }

  async joinByCode(guestId: string, dto: JoinDuelByCodeDto): Promise<DuelPublicView> {
    const { data: game, error } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .eq('invite_code', dto.inviteCode.toUpperCase())
      .single();

    if (error || !game) throw new NotFoundException('Duel not found.');
    const row = game as DuelGameRow;

    if (row.status !== 'waiting') throw new ConflictException('This duel is no longer open to join.');
    if (row.host_id === guestId) throw new BadRequestException('You cannot join your own duel.');
    if (row.guest_id && row.guest_id !== guestId) throw new ConflictException('This duel is already full.');

    const { data: updated, error: updErr } = await this.supabaseService.client
      .from('duel_games')
      .update({ guest_id: guestId })
      .eq('id', row.id)
      .eq('status', 'waiting')
      .is('guest_id', null)
      .select('*')
      .single();

    if (updErr || !updated) throw new ConflictException('Could not join — duel may have just been taken.');

    const [hostUsername, guestUsername] = await Promise.all([
      this.getUsername(row.host_id),
      this.getUsername(guestId),
    ]);

    return this.toPublicView(updated as DuelGameRow, guestId, hostUsername, guestUsername);
  }

  async joinQueue(userId: string, language: 'en' | 'el'): Promise<DuelPublicView> {
    // Look for an open waiting game created by someone else in the same language
    const { data: candidates } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .eq('status', 'waiting')
      .eq('language', language)
      .is('guest_id', null)
      .neq('host_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (candidates && candidates.length > 0) {
      const candidate = candidates[0] as DuelGameRow;
      const { data: joined, error } = await this.supabaseService.client
        .from('duel_games')
        .update({ guest_id: userId })
        .eq('id', candidate.id)
        .eq('status', 'waiting')
        .is('guest_id', null)
        .select('*')
        .single();

      if (!error && joined) {
        const [hostUsername, guestUsername] = await Promise.all([
          this.getUsername(candidate.host_id),
          this.getUsername(userId),
        ]);
        return this.toPublicView(joined as DuelGameRow, userId, hostUsername, guestUsername);
      }
      // Race condition — someone else grabbed it; fall through to create own
    }

    // No open games — create one without an invite code (queue marker)
    const questions = await this.questionPoolService.drawForDuel(language, PREFETCH_COUNT);
    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .insert({
        host_id: userId,
        invite_code: null,
        questions,
        pool_question_ids: questions.map((q) => q.id),
        language,
        status: 'waiting',
      })
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to join queue.');
    const hostUsername = await this.getUsername(userId);
    return this.toPublicView(data as DuelGameRow, userId, hostUsername, null);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getGame(userId: string, gameId: string): Promise<DuelPublicView> {
    const row = await this.fetchGame(gameId, userId);
    const [hostUsername, guestUsername] = await Promise.all([
      this.getUsername(row.host_id),
      row.guest_id ? this.getUsername(row.guest_id) : Promise.resolve(null),
    ]);
    return this.toPublicView(row, userId, hostUsername, guestUsername);
  }

  async listMyGames(userId: string): Promise<DuelGameSummary[]> {
    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .select('id, invite_code, status, scores, host_id, guest_id, updated_at')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
      .in('status', ['waiting', 'active'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) throw new BadRequestException(error.message);

    return await Promise.all(
      (data as DuelGameRow[]).map(async (row) => {
        const opponentId = row.host_id === userId ? row.guest_id : row.host_id;
        const opponentUsername = opponentId ? await this.getUsername(opponentId) : null;
        return {
          id: row.id,
          status: row.status,
          inviteCode: row.invite_code,
          scores: row.scores,
          opponentUsername,
          updatedAt: row.updated_at,
        } as DuelGameSummary;
      }),
    );
  }

  // ── Ready up ──────────────────────────────────────────────────────────────

  async markReady(userId: string, gameId: string): Promise<DuelPublicView> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status !== 'waiting' && row.status !== 'active') {
      throw new BadRequestException('Game is not in a state where ready-up is allowed.');
    }
    if (!row.guest_id) throw new BadRequestException('Waiting for opponent to join first.');

    const role = row.host_id === userId ? 'host' : 'guest';
    const patch = role === 'host' ? { host_ready: true } : { guest_ready: true };

    const hostReady = role === 'host' ? true : row.host_ready;
    const guestReady = role === 'guest' ? true : row.guest_ready;

    const shouldActivate = hostReady && guestReady && row.status === 'waiting';

    const { data: updated, error } = await this.supabaseService.client
      .from('duel_games')
      .update({
        ...patch,
        ...(shouldActivate ? { status: 'active' } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !updated) throw new BadRequestException('Failed to mark ready.');

    const [hostUsername, guestUsername] = await Promise.all([
      this.getUsername(row.host_id),
      row.guest_id ? this.getUsername(row.guest_id) : Promise.resolve(null),
    ]);
    return this.toPublicView(updated as DuelGameRow, userId, hostUsername, guestUsername);
  }

  // ── Answer submission ─────────────────────────────────────────────────────

  async submitAnswer(userId: string, gameId: string, dto: DuelAnswerDto): Promise<DuelAnswerResult> {
    const row = await this.fetchGame(gameId, userId);

    if (row.status !== 'active') throw new BadRequestException('Game is not active.');
    if (row.current_question_answered_by !== null) {
      // Question already claimed by someone — they should get the next question via Realtime
      throw new ConflictException('This question has already been answered.');
    }
    if (dto.questionIndex !== row.current_question_index) {
      throw new BadRequestException('Stale submission — question index mismatch.');
    }

    const question = row.questions[row.current_question_index] as GeneratedQuestion;
    if (!question) throw new BadRequestException('No question at this index.');

    const role: 'host' | 'guest' = row.host_id === userId ? 'host' : 'guest';

    // Validate answer (async path handles borderline fuzzy + LLM judge)
    const correct = await this.answerValidator.validateAsync(question, dto.answer);

    if (!correct) {
      return { correct: false };
    }

    // Attempt atomic CAS: claim the question for this player
    const newScores = {
      host: row.scores.host + (role === 'host' ? 1 : 0),
      guest: row.scores.guest + (role === 'guest' ? 1 : 0),
    };

    const nextIndex = row.current_question_index + 1;
    const gameFinished = newScores[role] >= WIN_TARGET;

    const questionResult: DuelQuestionResult = {
      index: row.current_question_index,
      winner: role,
      question_text: question.question_text,
      correct_answer: question.correct_answer,
    };

    const { data: claimed, error: claimError } = await this.supabaseService.client
      .from('duel_games')
      .update({
        // Reset answered_by to null in the same atomic write so the next question
        // is immediately claimable — eliminates the fire-and-forget TOCTOU window.
        current_question_answered_by: null,
        current_question_index: nextIndex,
        scores: newScores,
        question_results: [...row.question_results, questionResult],
        ...(gameFinished ? { status: 'finished' } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('current_question_index', row.current_question_index)
      .is('current_question_answered_by', null)
      .select('id')
      .single();

    if (claimError || !claimed) {
      // Another player claimed it first (race condition — both were correct simultaneously)
      return { correct: true, lostRace: true };
    }

    const gameWinner: 'host' | 'guest' | 'draw' | undefined = gameFinished ? role : undefined;

    return {
      correct: true,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      winner: role,
      scores: newScores,
      gameFinished,
      gameWinner,
    };
  }

  // ── Abandon ───────────────────────────────────────────────────────────────

  async abandonGame(userId: string, gameId: string): Promise<{ ok: boolean }> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status === 'finished' || row.status === 'abandoned') {
      throw new BadRequestException('Game is already over.');
    }

    await this.supabaseService.client
      .from('duel_games')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', gameId);

    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async fetchGame(gameId: string, userId: string): Promise<DuelGameRow> {
    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error || !data) throw new NotFoundException('Duel not found.');
    const row = data as DuelGameRow;
    if (row.host_id !== userId && row.guest_id !== userId) {
      throw new ForbiddenException('You are not a participant in this duel.');
    }
    return row;
  }

  private async getUsername(userId: string): Promise<string> {
    const { data } = await this.supabaseService.client
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
    return (data as { username: string } | null)?.username ?? 'Unknown';
  }

  private toPublicView(
    row: DuelGameRow,
    myUserId: string,
    hostUsername: string,
    guestUsername: string | null,
  ): DuelPublicView {
    const myRole: 'host' | 'guest' = row.host_id === myUserId ? 'host' : 'guest';

    const currentQuestion = this.toPublicQuestion(row.questions, row.current_question_index);

    return {
      id: row.id,
      status: row.status,
      inviteCode: row.invite_code,
      myRole,
      myUserId,
      hostUsername,
      guestUsername,
      scores: row.scores,
      currentQuestion,
      currentQuestionIndex: row.current_question_index,
      questionResults: row.question_results,
      hostReady: row.host_ready,
      guestReady: row.guest_ready,
      language: row.language,
    };
  }

  private toPublicQuestion(
    questions: GeneratedQuestion[],
    index: number,
  ): DuelPublicQuestion | null {
    const q = questions[index];
    if (!q) return null;
    return {
      index,
      question_text: q.question_text,
      explanation: '', // revealed only after question is won
      category: q.category,
      difficulty: q.difficulty,
    };
  }
}
