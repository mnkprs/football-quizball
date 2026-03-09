import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface BlitzStartResponse {
  session_id: string;
  time_limit: number;
  first_question: BlitzQuestionRef;
}

export interface BlitzQuestionRef {
  question_id: string;
  question_text: string;
  choices: string[];
  category: string;
  difficulty: string;
}

export interface BlitzAnswerResponse {
  correct: boolean;
  correct_answer: string;
  score: number;
  total_answered: number;
  time_up: boolean;
  next_question: BlitzQuestionRef | null;
}

export interface BlitzEndResponse {
  score: number;
  total_answered: number;
}

export interface BlitzLeaderboardEntry {
  user_id: string;
  username: string;
  score: number;
  total_answered: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class BlitzApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/blitz`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  startSession(language: string = 'en'): Observable<BlitzStartResponse> {
    return this.http.post<BlitzStartResponse>(`${this.base}/session`, { language }, { headers: this.headers() });
  }

  submitAnswer(sessionId: string, answer: string): Observable<BlitzAnswerResponse> {
    return this.http.post<BlitzAnswerResponse>(
      `${this.base}/session/${sessionId}/answer`,
      { answer },
      { headers: this.headers() },
    );
  }

  endSession(sessionId: string): Observable<BlitzEndResponse> {
    return this.http.post<BlitzEndResponse>(
      `${this.base}/session/${sessionId}/end`,
      {},
      { headers: this.headers() },
    );
  }

  getLeaderboard(): Observable<BlitzLeaderboardEntry[]> {
    return this.http.get<BlitzLeaderboardEntry[]>(`${this.base}/leaderboard`);
  }

  getMyStats(): Observable<{ bestScore: number; totalGames: number; rank: number | null }> {
    return this.http.get<{ bestScore: number; totalGames: number; rank: number | null }>(`${this.base}/me/stats`, {
      headers: this.headers(),
    });
  }
}
