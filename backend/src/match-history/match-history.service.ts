import { Injectable, Logger, UnauthorizedException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AchievementsService } from '../achievements/achievements.service';
import { CacheService } from '../cache/cache.service';
import type { MatchDetail, MatchDetailSnapshot, BRQuestionDetail, BRPlayerAnswer } from '../common/interfaces/match.interface';
import type { GameSession } from '../common/interfaces/game.interface';
import { CATEGORY_LABELS } from '../questions/question.types';

@Injectable()
export class MatchHistoryService {
  private readonly logger = new Logger(MatchHistoryService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly achievementsService: AchievementsService,
    private readonly cacheService: CacheService,
  ) {}

  async saveMatch(
    requestingUserId: string,
    match: {
      player1_id: string;
      player2_id: string | null;
      player1_username: string;
      player2_username: string;
      winner_id: string | null;
      player1_score: number;
      player2_score: number;
      match_mode: 'local' | 'online' | 'duel' | 'battle_royale' | 'team_logo_battle';
      game_ref_id?: string;
      game_ref_type?: string;
    },
  ): Promise<void> {
    if (match.player1_id !== requestingUserId) throw new UnauthorizedException();

    const detail_snapshot = await this.buildSnapshot(match.match_mode, match.game_ref_id);

    const saved = await this.supabaseService.saveMatchResult({
      ...match,
      game_ref_id: match.game_ref_id ?? undefined,
      game_ref_type: match.game_ref_type ?? undefined,
      detail_snapshot,
    });
    if (!saved) {
      this.logger.error(`[saveMatch] Failed to save match for user ${requestingUserId}`);
      return;
    }

    // Always check achievements after saving (win count query is efficient)
    const wins = await this.supabaseService.getMatchWinCount(requestingUserId);
    this.logger.debug(`[saveMatch] User ${requestingUserId} has ${wins} match wins — checking achievements`);
    const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(requestingUserId);
    await this.achievementsService.checkAndAward(requestingUserId, { matchWins: wins, dailyStreak });
  }

  async getHistory(userId: string, requestingUserId?: string) {
    // Pro depth applies only when a user views their own history.
    // Viewing another user's profile returns the standard (free-tier) limit.
    const isOwnHistory = !!requestingUserId && requestingUserId === userId;
    const proUserId = isOwnHistory ? userId : null;
    const proStatus = proUserId ? await this.supabaseService.getProStatus(proUserId) : null;
    const limit = proStatus?.is_pro ? 100 : 10;
    return this.supabaseService.getMatchHistory(userId, limit);
  }

  async getMatchDetail(matchId: string, requestingUserId: string): Promise<MatchDetail> {
    const match = await this.supabaseService.getMatchById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    // Only participants can view details
    if (match.player1_id !== requestingUserId && match.player2_id !== requestingUserId) {
      throw new ForbiddenException();
    }

    const detail: MatchDetail = { ...match };

    // Prefer snapshot (persisted at save time) over ephemeral source data.
    let snapshotCoversAll = false;
    if (match.detail_snapshot) {
      Object.assign(detail, match.detail_snapshot);
      // Snapshot fully covers local matches today; for other modes, still enrich below.
      if (match.game_ref_type === 'local') snapshotCoversAll = true;
    }

    if (!snapshotCoversAll && match.game_ref_id && match.game_ref_type) {
      try {
        switch (match.game_ref_type) {
          case 'duel': {
            const game = await this.supabaseService.getDuelGameById(match.game_ref_id);
            if (game) {
              detail.question_results = game.question_results ?? [];
            }
            break;
          }
          case 'online': {
            const game = await this.supabaseService.getOnlineGameById(match.game_ref_id);
            if (game) {
              detail.players = game.players;
              detail.board = (game.board as any[][]).map((row: any[]) =>
                row.map((c: any) => ({
                  category: c.category,
                  difficulty: c.difficulty,
                  points: c.points ?? c.points_awarded ?? 0,
                  answered_by: c.answered_by,
                })),
              );
              // Derive categories from first row of board
              const seen = new Set<string>();
              detail.categories = (game.board as any[][]).map((row: any[]) => {
                const cat = row[0]?.category ?? '';
                if (seen.has(cat)) return null;
                seen.add(cat);
                return { key: cat, label: cat };
              }).filter(Boolean) as Array<{ key: string; label: string }>;
            }
            break;
          }
          case 'local': {
            const session = await this.cacheService.get<GameSession>(`game:${match.game_ref_id}`);
            if (session) {
              detail.players = session.players.map((p) => ({
                name: p.name,
                score: p.score,
                lifelineUsed: p.lifelineUsed,
                doubleUsed: p.doubleUsed,
              }));
              detail.board = session.board.map((row) =>
                row.map((c) => ({
                  category: c.category,
                  difficulty: c.difficulty,
                  points: c.points_awarded ?? c.points ?? 0,
                  answered_by: c.answered_by,
                })),
              );
              const seen = new Set<string>();
              detail.categories = session.board.map((row) => {
                const cat = row[0]?.category ?? '';
                if (seen.has(cat)) return null;
                seen.add(cat);
                return { key: cat, label: CATEGORY_LABELS[cat] ?? cat };
              }).filter(Boolean) as Array<{ key: string; label: string }>;
            }
            break;
          }
          case 'battle_royale':
          case 'team_logo_battle': {
            const { room, players } = await this.supabaseService.getBRRoomWithPlayers(match.game_ref_id);
            if (players.length > 0) {
              detail.br_players = players.map((p, i) => ({
                username: p.username,
                score: p.score,
                rank: i + 1,
                teamId: p.team_id ?? undefined,
              }));
            }
            if (room) {
              detail.br_mode = room.mode ?? 'standard';
            }
            // Per-question breakdown: combine room.questions with per-player answer entries.
            // Server-computed is_correct avoids the frontend re-doing fuzzy matching incorrectly.
            if (room && players.length > 0) {
              const roomQuestions = ((room as { questions?: unknown[] }).questions ?? []) as Array<{ question_text?: string; correct_answer?: string }>;
              const maxAnswers = Math.max(0, ...players.map((p: { player_answers?: unknown[] }) => (p.player_answers ?? []).length));
              const br_questions: BRQuestionDetail[] = [];
              for (let i = 0; i < maxAnswers; i++) {
                const q = roomQuestions[i];
                const per_player_answers: Record<string, BRPlayerAnswer> = {};
                for (const p of players as Array<{ user_id: string; player_answers?: Array<{ answer: string; is_correct: boolean }> }>) {
                  const entry = (p.player_answers ?? [])[i];
                  if (entry) per_player_answers[p.user_id] = { answer: entry.answer, is_correct: !!entry.is_correct };
                }
                br_questions.push({
                  index: i,
                  text: q?.question_text ?? '',
                  correct_answer: q?.correct_answer ?? '',
                  per_player_answers,
                });
              }
              if (br_questions.length > 0) detail.br_questions = br_questions;
            }
            // Team scores: aggregate from players
            if (match.game_ref_type === 'team_logo_battle' && players.length > 0) {
              const team1 = players.filter((p) => p.team_id === 1);
              const team2 = players.filter((p) => p.team_id === 2);
              const sum = (arr: any[]) => arr.reduce((s, p) => s + p.score, 0);
              detail.team_scores = { team1: sum(team1), team2: sum(team2) };
              // MVP: highest individual score
              const top = players[0];
              if (top) detail.mvp = { username: top.username, score: top.score };
            }
            break;
          }
        }
      } catch (e) {
        this.logger.warn(`[getMatchDetail] Failed to fetch game details for ${match.game_ref_type}/${match.game_ref_id}: ${(e as Error)?.message}`);
      }
    }

    // Finalize: apply pro gating
    const proStatus = await this.supabaseService.getProStatus(requestingUserId);
    const isPro = !!proStatus?.is_pro;

    const hasQuestions =
      (detail.duel_questions && detail.duel_questions.length > 0) ||
      (detail.br_questions && detail.br_questions.length > 0) ||
      (detail.question_results && detail.question_results.length > 0) ||
      (!!detail.board && !!detail.players);

    detail.questionsAvailable = !!hasQuestions;
    detail.questionsLocked = !isPro;

    if (!isPro) {
      delete detail.duel_questions;
      delete detail.br_questions;
      delete detail.question_results;
      // Strip nested snapshot too — `{ ...match }` copies detail_snapshot verbatim
      // and would otherwise leak questions to non-pro clients via the nested field.
      delete (detail as { detail_snapshot?: unknown }).detail_snapshot;
    }

    return detail;
  }

  /**
   * Capture a durable snapshot of per-cell state at save time for `local` matches.
   *
   * Duel/online/BR persist their own state in dedicated tables (`duel_games`,
   * `online_games`, `battle_royale_rooms`+`battle_royale_players`) and save match
   * history directly via SupabaseService.saveMatchResult — bypassing this service.
   * Only local games need a snapshot because their source (Redis `game:${id}`) is ephemeral.
   */
  private async buildSnapshot(
    match_mode: string,
    game_ref_id: string | undefined,
  ): Promise<MatchDetailSnapshot | undefined> {
    if (!game_ref_id || match_mode !== 'local') return undefined;

    const session = await this.cacheService.get<GameSession>(`game:${game_ref_id}`);
    if (!session) return undefined;

    const seen = new Set<string>();
    const categories = session.board
      .map((row) => {
        const cat = row[0]?.category ?? '';
        if (seen.has(cat)) return null;
        seen.add(cat);
        return { key: cat, label: CATEGORY_LABELS[cat] ?? cat };
      })
      .filter(Boolean) as Array<{ key: string; label: string }>;

    // Index questions by id so each board cell can embed its text + answer for
    // post-match review. Falls back to undefined if the question is missing.
    const questionById = new Map(session.questions.map((q) => [q.id, q]));

    return {
      players: session.players.map((p) => ({
        name: p.name,
        score: p.score,
        lifelineUsed: p.lifelineUsed,
        doubleUsed: p.doubleUsed,
      })),
      board: session.board.map((row) =>
        row.map((c) => {
          const q = questionById.get(c.question_id);
          return {
            category: c.category,
            difficulty: c.difficulty,
            points: c.points_awarded ?? c.points ?? 0,
            answered_by: c.answered_by,
            question_text: q?.question_text,
            correct_answer: q?.correct_answer,
          };
        }),
      ),
      categories,
    };
  }
}
