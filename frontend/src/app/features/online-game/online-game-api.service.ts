import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

// ── Types (mirror backend OnlinePublicView) ───────────────────────────────────

export interface OnlinePlayerState {
  name: string;
  score: number;
  lifelineUsed: boolean;
  doubleUsed: boolean;
}

export interface OnlineBoardCell {
  question_id: string;
  category: string;
  difficulty: string;
  points: number;
  answered: boolean;
  answered_by?: string;
}

export interface OnlineQuestionDetail {
  id: string;
  question_text: string;
  category: string;
  difficulty: string;
  image_url?: string;
  fifty_fifty_applicable?: boolean;
  meta?: Record<string, unknown>;
}

export interface OnlineTop5Progress {
  filledSlots: Array<{ name: string; stat: string } | null>;
  wrongGuesses: Array<{ name: string; stat: string }>;
  complete: boolean;
  won: boolean;
}

export interface OnlineTurnState {
  questionId: string;
  question: OnlineQuestionDetail;
  attempts: string[];
  top5Progress: OnlineTop5Progress | null;
  phase: 'answering' | 'top5' | 'result';
}

export interface OnlineLastResult {
  questionId: string;
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
  original_image_url?: string;
  top5Won?: boolean;
  top5FilledSlots?: Array<{ name: string; stat: string } | null>;
  top5WrongGuesses?: Array<{ name: string; stat: string }>;
}

export interface OnlineCategoryMeta {
  key: string;
  label: string;
}

export interface OnlinePublicView {
  id: string;
  inviteCode: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  myRole: 'host' | 'guest';
  myPlayerIndex: 0 | 1;
  players: [OnlinePlayerState, ...OnlinePlayerState[]];
  currentPlayerIndex: 0 | 1;
  board: OnlineBoardCell[][];
  categories: OnlineCategoryMeta[];
  hostReady: boolean;
  guestReady: boolean;
  turnState: OnlineTurnState | null;
  lastResult: OnlineLastResult | null;
}

export interface OnlineFiftyFiftyResult {
  options: string[];
  points_if_correct: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class OnlineGameApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/online-games`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  createGame(playerName: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(this.base, { playerName }, { headers: this.headers() });
  }

  joinByCode(inviteCode: string, playerName?: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/join`, { inviteCode, playerName }, { headers: this.headers() });
  }

  getGame(gameId: string): Observable<OnlinePublicView> {
    return this.http.get<OnlinePublicView>(`${this.base}/${gameId}`, { headers: this.headers() });
  }

  markReady(gameId: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/ready`, {}, { headers: this.headers() });
  }

  selectQuestion(gameId: string, questionId: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/select`, { questionId }, { headers: this.headers() });
  }

  submitAnswer(gameId: string, questionId: string, answer: string, useDouble?: boolean): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(
      `${this.base}/${gameId}/answer`,
      { questionId, answer, useDouble },
      { headers: this.headers() },
    );
  }

  useLifeline(gameId: string, questionId: string): Observable<OnlineFiftyFiftyResult> {
    return this.http.post<OnlineFiftyFiftyResult>(
      `${this.base}/${gameId}/fifty`,
      { questionId },
      { headers: this.headers() },
    );
  }

  submitTop5Guess(gameId: string, questionId: string, answer: string, useDouble?: boolean): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(
      `${this.base}/${gameId}/top5/guess`,
      { questionId, answer, useDouble },
      { headers: this.headers() },
    );
  }

  stopTop5Early(gameId: string, questionId: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(
      `${this.base}/${gameId}/top5/stop`,
      { questionId },
      { headers: this.headers() },
    );
  }

  continueToBoard(gameId: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/continue`, {}, { headers: this.headers() });
  }

  abandonGame(gameId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${gameId}/abandon`, {}, { headers: this.headers() });
  }
}
