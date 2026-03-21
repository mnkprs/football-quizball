import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface OnlineGamePublicView {
  id: string;
  status: 'waiting' | 'queued' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  currentPlayerId: string | null;
  myRole: 'host' | 'guest';
  myUserId: string;
  playerScores: { host: number; guest: number };
  playerMeta: {
    host: { lifelineUsed: boolean; doubleUsed: boolean };
    guest: { lifelineUsed: boolean; doubleUsed: boolean };
  };
  lastResult: OnlineAnswerResult | null;
  turnDeadline: string | null;
  board: OnlineBoardCell[][];
  categories: Array<{ key: string; label: string }>;
  hostId: string;
  guestId: string | null;
  hostUsername: string;
  guestUsername: string | null;
}

export interface OnlineBoardCell {
  question_id: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  answered: boolean;
  answered_by?: 'host' | 'guest';
  points_awarded?: number;
  lifeline_applied?: boolean;
  double_armed?: boolean;
}

/** Matches the shape of offline AnswerResult so ResultComponent works unchanged. */
export interface OnlineAnswerResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  /** [host_score, guest_score] to match offline AnswerResult tuple shape */
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
}

export interface OnlineHintResult {
  options: string[];
  pointsIfCorrect: number;
}

export interface OnlineTop5GuessResult {
  matched: boolean;
  position: number | null;
  fullName: string;
  stat: string;
  wrongCount: number;
  filledCount: number;
  filledSlots: Array<{ name: string; stat: string } | null>;
  wrongGuesses: Array<{ name: string; stat: string }>;
  complete: boolean;
  won: boolean;
  points_awarded?: number;
  player_scores?: { host: number; guest: number };
  correct_answer?: string;
  explanation?: string;
}

export interface OnlineGameSummary {
  id: string;
  status: 'waiting' | 'queued' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  myRole: 'host' | 'guest';
  isMyTurn: boolean;
  playerScores: { host: number; guest: number };
  opponentUsername: string | null;
  turnDeadline: string | null;
  updatedAt: string;
}

export interface OnlineQuestion {
  id: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  question_text: string;
  fifty_fifty_applicable: boolean;
  image_url: string | null;
  meta?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class OnlineGameApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/online-games`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  createGame(): Observable<OnlineGamePublicView> {
    return this.http.post<OnlineGamePublicView>(this.base, {}, { headers: this.headers() });
  }

  listMyGames(): Observable<OnlineGameSummary[]> {
    return this.http.get<OnlineGameSummary[]>(this.base, { headers: this.headers() });
  }

  getGameCount(): Observable<{ count: number; isPro: boolean }> {
    return this.http.get<{ count: number; isPro: boolean }>(`${this.base}/count`, { headers: this.headers() });
  }

  joinQueue(): Observable<OnlineGamePublicView> {
    return this.http.post<OnlineGamePublicView>(`${this.base}/queue`, {}, { headers: this.headers() });
  }

  previewInvite(code: string): Observable<{ hostUsername: string; status: string }> {
    return this.http.get<{ hostUsername: string; status: string }>(`${this.base}/preview/${code}`);
  }

  joinByCode(inviteCode: string): Observable<OnlineGamePublicView> {
    return this.http.post<OnlineGamePublicView>(`${this.base}/join`, { inviteCode }, { headers: this.headers() });
  }

  getGame(gameId: string): Observable<OnlineGamePublicView> {
    return this.http.get<OnlineGamePublicView>(`${this.base}/${gameId}`, { headers: this.headers() });
  }

  getQuestion(gameId: string, questionId: string): Observable<OnlineQuestion> {
    return this.http.get<OnlineQuestion>(`${this.base}/${gameId}/questions/${questionId}`, { headers: this.headers() });
  }

  submitAnswer(gameId: string, questionId: string, answer: string, useDouble?: boolean): Observable<OnlineAnswerResult> {
    return this.http.post<OnlineAnswerResult>(`${this.base}/${gameId}/answer`, { questionId, answer, ...(useDouble ? { useDouble: true } : {}) }, { headers: this.headers() });
  }

  useLifeline(gameId: string, questionId: string): Observable<OnlineHintResult> {
    return this.http.post<OnlineHintResult>(`${this.base}/${gameId}/fifty`, { questionId }, { headers: this.headers() });
  }

  submitTop5Guess(gameId: string, questionId: string, answer: string, useDouble?: boolean): Observable<OnlineTop5GuessResult> {
    return this.http.post<OnlineTop5GuessResult>(`${this.base}/${gameId}/top5/guess`, { questionId, answer, ...(useDouble ? { useDouble: true } : {}) }, { headers: this.headers() });
  }

  stopTop5Early(gameId: string, questionId: string): Observable<OnlineTop5GuessResult> {
    return this.http.post<OnlineTop5GuessResult>(`${this.base}/${gameId}/top5/stop`, { questionId }, { headers: this.headers() });
  }

  abandonGame(gameId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${gameId}/abandon`, {}, { headers: this.headers() });
  }
}
