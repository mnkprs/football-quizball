import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

// ── Types (mirror backend battle-royale.types.ts) ─────────────────────────────

export interface BRCareerEntry {
  club: string;
  from: string;
  to: string;
  is_loan: boolean;
}

export interface BRPublicQuestion {
  index: number;
  question_text: string;
  choices: string[];
  category: string;
  difficulty: string;
  meta: { career: BRCareerEntry[] };
  // Team Logo mode: obscured/medium image shown during gameplay
  image_url?: string;
  // NOTE: original_image_url intentionally absent — arrives via BRAnswerResult
  // after the user submits their guess for this question.
}

export interface BRPlayerEntry {
  userId: string;
  username: string;
  score: number;
  currentQuestionIndex: number;
  finished: boolean;
  /** In-room rank during this game (1 = leading) */
  rank?: number;
  /**
   * Global ELO rank — solo ELO rank in classic rooms, logo_quiz ELO rank in team_logo rooms.
   * `null` means the player is unranked in the relevant mode (e.g. has not played a logo quiz yet).
   */
  profileRank?: number | null;
  // Team Logo mode: which team this player belongs to
  teamId?: 1 | 2;
}

export interface BRTeamScores {
  team1Avg: number;
  team2Avg: number;
}

export interface BRMvp {
  userId: string;
  username: string;
  score: number;
}

export interface BRPublicView {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  inviteCode: string | null;
  hostId: string;
  isHost: boolean;
  isPrivate: boolean;
  myUserId: string;
  questionCount: number;
  players: BRPlayerEntry[];
  currentQuestion: BRPublicQuestion | null;
  myCurrentIndex: number;
  language: string;
  startedAt: string | null;
  // Team Logo mode fields
  mode?: 'classic' | 'team_logo';
  teamScores?: BRTeamScores;
  mvp?: BRMvp;
}

export interface BRAnswerResult {
  correct: boolean;
  correct_answer: string;
  myScore: number;
  nextQuestion: BRPublicQuestion | null;
  finished: boolean;
  pointsAwarded: number;
  timeBonus: number;
  // Team Logo mode: original logo revealed after answering
  original_image_url?: string;
  // Team Logo mode: team metadata revealed after answering
  team_metadata?: { slug: string; league: string; country: string };
  // Set true when the server rejected the submission as too-fast (anti-robot).
  rejected_too_fast?: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BattleRoyaleApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/battle-royale`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  createRoom(language?: 'en' | 'el'): Observable<{ roomId: string; inviteCode: string }> {
    return this.http.post<{ roomId: string; inviteCode: string }>(this.base, { language }, { headers: this.headers() });
  }

  createTeamLogoRoom(): Observable<{ roomId: string; inviteCode: string }> {
    return this.http.post<{ roomId: string; inviteCode: string }>(
      `${this.base}/team-logo`,
      {},
      { headers: this.headers() },
    );
  }

  joinByCode(inviteCode: string): Observable<{ roomId: string }> {
    return this.http.post<{ roomId: string }>(`${this.base}/join`, { inviteCode }, { headers: this.headers() });
  }

  joinQueue(): Observable<{ roomId: string; isHost: boolean }> {
    return this.http.post<{ roomId: string; isHost: boolean }>(`${this.base}/queue`, {}, { headers: this.headers() });
  }

  getRoom(roomId: string): Observable<BRPublicView> {
    return this.http.get<BRPublicView>(`${this.base}/${roomId}`, { headers: this.headers() });
  }

  startRoom(roomId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${roomId}/start`, {}, { headers: this.headers() });
  }

  submitAnswer(roomId: string, questionIndex: number, answer: string): Observable<BRAnswerResult> {
    return this.http.post<BRAnswerResult>(
      `${this.base}/${roomId}/answer`,
      { questionIndex, answer },
      { headers: this.headers() },
    );
  }

  leaveRoom(roomId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${roomId}/leave`, { headers: this.headers() });
  }

  getLeaderboard(roomId: string): Observable<BRPlayerEntry[]> {
    return this.http.get<BRPlayerEntry[]>(`${this.base}/${roomId}/leaderboard`, { headers: this.headers() });
  }

  getPublicRooms(): Observable<{
    id: string;
    inviteCode: string;
    playerCount: number;
    maxPlayers: number;
    createdAt: string;
    hostUsername: string;
  }[]> {
    return this.http.get<{
      id: string;
      inviteCode: string;
      playerCount: number;
      maxPlayers: number;
      createdAt: string;
      hostUsername: string;
    }[]>(`${this.base}/rooms`, { headers: this.headers() });
  }
}
