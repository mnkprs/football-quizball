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
}

export interface BRPlayerEntry {
  userId: string;
  username: string;
  score: number;
  currentQuestionIndex: number;
  finished: boolean;
  rank?: number;
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
}

export interface BRAnswerResult {
  correct: boolean;
  correct_answer: string;
  myScore: number;
  nextQuestion: BRPublicQuestion | null;
  finished: boolean;
  pointsAwarded: number;
  timeBonus: number;
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
}
