import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

// ── Types (mirror backend duel.types.ts) ─────────────────────────────────────

export type DuelGameType = 'standard' | 'logo';

export interface DuelPublicQuestion {
  index: number;
  question_text: string;
  explanation: string;
  category: string;
  difficulty: string;
  image_url?: string;
  original_image_url?: string;
}

export interface DuelQuestionResult {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
  is_pro_logo?: boolean;
}

export interface DuelReservationInfo {
  reservedAt: string;
  /** Server-clamped to [0, 10]. Used by the floating queue widget countdown. */
  secondsRemaining: number;
  hostAccepted: boolean;
  guestAccepted: boolean;
}

export interface DuelPublicView {
  id: string;
  status: 'waiting' | 'reserved' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  myRole: 'host' | 'guest';
  myUserId: string;
  hostUsername: string;
  guestUsername: string | null;
  scores: { host: number; guest: number };
  currentQuestion: DuelPublicQuestion | null;
  currentQuestionIndex: number;
  questionResults: DuelQuestionResult[];
  hostReady: boolean;
  guestReady: boolean;
  gameType: DuelGameType;
  /** Present only when status === 'reserved' — drives the queue widget. */
  reservation?: DuelReservationInfo;
}

export interface DuelAnswerResult {
  correct: boolean;
  lostRace?: boolean;
  correct_answer?: string;
  explanation?: string;
  winner?: 'host' | 'guest';
  scores?: { host: number; guest: number };
  gameFinished?: boolean;
  gameWinner?: 'host' | 'guest' | 'draw';
}

export interface DuelGameSummary {
  id: string;
  status: 'waiting' | 'reserved' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  scores: { host: number; guest: number };
  opponentUsername: string | null;
  updatedAt: string;
  gameType: DuelGameType;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DuelApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/duel`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  createGame(gameType?: DuelGameType): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(this.base, { gameType }, { headers: this.headers() });
  }

  listMyGames(gameType?: DuelGameType): Observable<DuelGameSummary[]> {
    const options: Record<string, unknown> = { headers: this.headers() };
    if (gameType) options['params'] = { gameType };
    return this.http.get<DuelGameSummary[]>(this.base, options);
  }

  joinQueue(gameType?: DuelGameType): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(`${this.base}/queue`, { gameType }, { headers: this.headers() });
  }

  joinByCode(inviteCode: string, gameType?: DuelGameType): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(`${this.base}/join`, { inviteCode, gameType }, { headers: this.headers() });
  }

  getGame(gameId: string): Observable<DuelPublicView> {
    return this.http.get<DuelPublicView>(`${this.base}/${gameId}`, { headers: this.headers() });
  }

  markReady(gameId: string): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(`${this.base}/${gameId}/ready`, {}, { headers: this.headers() });
  }

  /** Accept a match-found reservation within the 10s window. */
  acceptGame(gameId: string): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(`${this.base}/${gameId}/accept`, {}, { headers: this.headers() });
  }

  submitAnswer(gameId: string, answer: string, questionIndex: number): Observable<DuelAnswerResult> {
    return this.http.post<DuelAnswerResult>(
      `${this.base}/${gameId}/answer`,
      { answer, questionIndex },
      { headers: this.headers() },
    );
  }

  abandonGame(gameId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${gameId}/abandon`, {}, { headers: this.headers() });
  }

  timeoutQuestion(gameId: string, questionIndex: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.base}/${gameId}/timeout`,
      { questionIndex },
      { headers: this.headers() },
    );
  }
}
