/**
 * Normalized row shape for the leaderboard list.
 *
 * Backend returns 4 different entry shapes (solo/logoQuiz/logoQuizHardcore/duel)
 * with different primary stats and field names. This module collapses them into
 * a single render-ready row so the template can stay dumb.
 */

import type { EloTierId } from '../../core/elo-tier';
import { getEloTier } from '../../core/elo-tier';
import type {
  LeaderboardEntry,
  LogoQuizLeaderboardEntry,
  LogoQuizHardcoreLeaderboardEntry,
  DuelLeaderboardEntry,
} from '../../core/leaderboard-api.service';

export type LeaderboardSource = 'solo' | 'logoQuiz' | 'logoQuizHardcore' | 'duel';

export interface LeaderboardRow {
  /** Profile id — used for routerLink to /profile/:id */
  id: string;
  rank: number;
  username: string;
  /** Primary score shown in the right column (elo or wins). */
  score: number;
  /** Label under the score (e.g. "ELO", "Wins"). */
  scoreLabel: string;
  /** Secondary stat line shown under the name. */
  meta: string;
  /** Tier id for avatar ring + row accent. Undefined means "no tier shown". */
  tier?: EloTierId;
  /** True when this row represents the currently logged-in user. */
  isMe: boolean;
}

const pct = (num: number, den: number): number => (den ? Math.round((num / den) * 100) : 0);

function baseRow(
  id: string,
  rank: number,
  username: string,
  currentUserId: string | null,
): Pick<LeaderboardRow, 'id' | 'rank' | 'username' | 'isMe'> {
  return { id, rank, username, isMe: currentUserId === id };
}

export function soloRow(e: LeaderboardEntry, rank: number, currentUserId: string | null): LeaderboardRow {
  return {
    ...baseRow(e.id, rank, e.username, currentUserId),
    score: e.elo,
    scoreLabel: 'ELO',
    meta: `${e.questions_answered} questions · ${pct(e.correct_answers, e.questions_answered)}% accuracy`,
    tier: getEloTier(e.elo).tier,
  };
}

export function logoQuizRow(e: LogoQuizLeaderboardEntry, rank: number, currentUserId: string | null): LeaderboardRow {
  return {
    ...baseRow(e.id, rank, e.username, currentUserId),
    score: e.logo_quiz_elo,
    scoreLabel: 'ELO',
    meta: `${e.logo_quiz_games_played} games played`,
    tier: getEloTier(e.logo_quiz_elo).tier,
  };
}

export function logoQuizHardcoreRow(e: LogoQuizHardcoreLeaderboardEntry, rank: number, currentUserId: string | null): LeaderboardRow {
  return {
    ...baseRow(e.id, rank, e.username, currentUserId),
    score: e.logo_quiz_hardcore_elo,
    scoreLabel: 'ELO',
    meta: `${e.logo_quiz_hardcore_games_played} games played`,
    tier: getEloTier(e.logo_quiz_hardcore_elo).tier,
  };
}

export function duelRow(e: DuelLeaderboardEntry, rank: number, currentUserId: string | null): LeaderboardRow {
  const winRate = pct(e.wins, e.games_played);
  return {
    ...baseRow(e.user_id, rank, e.username, currentUserId),
    score: e.wins,
    scoreLabel: 'Wins',
    meta: `${e.wins}W · ${e.losses}L · ${winRate}% win rate`,
    // Duel has no ELO — keep tier undefined so the row skips the ring + accent.
    tier: undefined,
  };
}

type WithRank<T> = T & { rank: number };

export const toRows = {
  solo: (entries: readonly LeaderboardEntry[], uid: string | null): LeaderboardRow[] =>
    entries.map((e, i) => soloRow(e, i + 1, uid)),
  logoQuiz: (entries: readonly LogoQuizLeaderboardEntry[], uid: string | null): LeaderboardRow[] =>
    entries.map((e, i) => logoQuizRow(e, i + 1, uid)),
  logoQuizHardcore: (entries: readonly LogoQuizHardcoreLeaderboardEntry[], uid: string | null): LeaderboardRow[] =>
    entries.map((e, i) => logoQuizHardcoreRow(e, i + 1, uid)),
  duel: (entries: readonly DuelLeaderboardEntry[], uid: string | null): LeaderboardRow[] =>
    entries.map((e, i) => duelRow(e, i + 1, uid)),
};

export const meToRow = {
  solo: (e: WithRank<LeaderboardEntry> | null, uid: string | null): LeaderboardRow | null =>
    e ? soloRow(e, e.rank, uid) : null,
  logoQuiz: (e: WithRank<LogoQuizLeaderboardEntry> | null, uid: string | null): LeaderboardRow | null =>
    e ? logoQuizRow(e, e.rank, uid) : null,
  logoQuizHardcore: (e: WithRank<LogoQuizHardcoreLeaderboardEntry> | null, uid: string | null): LeaderboardRow | null =>
    e ? logoQuizHardcoreRow(e, e.rank, uid) : null,
  duel: (e: WithRank<DuelLeaderboardEntry> | null, uid: string | null): LeaderboardRow | null =>
    e ? duelRow(e, e.rank, uid) : null,
};
