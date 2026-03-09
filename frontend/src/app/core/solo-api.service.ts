import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface StartSessionResponse {
  session_id: string;
  user_elo: number;
}

export interface NextQuestionResponse {
  question_id: string;
  question_text: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  time_limit: number;
  questions_answered: number;
  current_elo: number;
}

export interface AnswerResponse {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  explanation: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  questions_answered: number;
  correct_answers: number;
}

export interface EndSessionResponse {
  questions_answered: number;
  correct_answers: number;
  elo_start: number;
  elo_end: number;
  elo_delta: number;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  elo: number;
  games_played: number;
  questions_answered: number;
  correct_answers: number;
  rank?: number;
  max_elo?: number;
}

@Injectable({ providedIn: 'root' })
export class SoloApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/solo`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  startSession(): Observable<StartSessionResponse> {
    return this.http.post<StartSessionResponse>(`${this.base}/session`, {}, { headers: this.headers() });
  }

  getNextQuestion(sessionId: string): Observable<NextQuestionResponse> {
    return this.http.get<NextQuestionResponse>(`${this.base}/session/${sessionId}/next`, { headers: this.headers() });
  }

  submitAnswer(sessionId: string, answer: string): Observable<AnswerResponse> {
    return this.http.post<AnswerResponse>(`${this.base}/session/${sessionId}/answer`, { answer }, { headers: this.headers() });
  }

  endSession(sessionId: string): Observable<EndSessionResponse> {
    return this.http.post<EndSessionResponse>(`${this.base}/session/${sessionId}/end`, {}, { headers: this.headers() });
  }

  getLeaderboard(): Observable<LeaderboardEntry[]> {
    return this.http.get<LeaderboardEntry[]>(`${this.base}/leaderboard`);
  }

  getMyLeaderboardEntry(): Observable<(LeaderboardEntry & { rank: number }) | null> {
    return this.http.get<(LeaderboardEntry & { rank: number }) | null>(`${this.base}/leaderboard/me`, {
      headers: this.headers(),
    });
  }

  getProfile(userId: string): Observable<{
    profile: LeaderboardEntry;
    blitz_stats?: { bestScore: number; totalGames: number; rank: number | null };
    history: any[];
  }> {
    return this.http.get<any>(`${this.base}/profile/${userId}`, { headers: this.headers() });
  }
}
