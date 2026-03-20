import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

// ── Types (mirror backend duel.types.ts) ─────────────────────────────────────

export interface DuelPublicQuestion {
  index: number;
  question_text: string;
  explanation: string;
  category: string;
  difficulty: string;
}

export interface DuelQuestionResult {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
}

export interface DuelPublicView {
  id: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
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
  language: string;
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
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  scores: { host: number; guest: number };
  opponentUsername: string | null;
  updatedAt: string;
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

  createGame(language?: 'en' | 'el'): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(this.base, { language }, { headers: this.headers() });
  }

  listMyGames(): Observable<DuelGameSummary[]> {
    return this.http.get<DuelGameSummary[]>(this.base, { headers: this.headers() });
  }

  joinQueue(language?: 'en' | 'el'): Observable<DuelPublicView> {
    const params = language ? `?language=${language}` : '';
    return this.http.post<DuelPublicView>(`${this.base}/queue${params}`, {}, { headers: this.headers() });
  }

  joinByCode(inviteCode: string): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(`${this.base}/join`, { inviteCode }, { headers: this.headers() });
  }

  getGame(gameId: string): Observable<DuelPublicView> {
    return this.http.get<DuelPublicView>(`${this.base}/${gameId}`, { headers: this.headers() });
  }

  markReady(gameId: string): Observable<DuelPublicView> {
    return this.http.post<DuelPublicView>(`${this.base}/${gameId}/ready`, {}, { headers: this.headers() });
  }

  submitAnswer(gameId: string, answer: string): Observable<DuelAnswerResult> {
    return this.http.post<DuelAnswerResult>(
      `${this.base}/${gameId}/answer`,
      { answer },
      { headers: this.headers() },
    );
  }

  abandonGame(gameId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${gameId}/abandon`, {}, { headers: this.headers() });
  }
}
