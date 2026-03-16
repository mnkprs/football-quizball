import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { LanguageService } from './language.service';
import { environment } from '../../environments/environment';

export interface MayhemQuestion {
  id: string;
  question_text: string;
  options: string[];
}

export interface MayhemAnswerResponse {
  correct: boolean;
  correct_answer: string;
  explanation: string;
}

export interface MayhemSessionResponse {
  session_id: string;
  user_elo: number;
}

export interface MayhemSessionAnswerResponse {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  explanation: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  questions_answered: number;
  correct_answers: number;
  current_elo: number;
}

export interface MayhemEndSessionResponse {
  questions_answered: number;
  correct_answers: number;
  elo_start: number;
  elo_end: number;
  elo_delta: number;
}

export interface MayhemLeaderboardEntry {
  user_id: string;
  username: string;
  current_elo: number;
  max_elo: number;
  games_played: number;
}

export interface MayhemMeEntry extends MayhemLeaderboardEntry {
  rank: number;
  best_session_score: number;
}

@Injectable({ providedIn: 'root' })
export class MayhemApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private lang = inject(LanguageService);
  private base = `${environment.apiUrl}/api/mayhem`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getQuestions(excludeIds: string[] = []) {
    const parts: string[] = [`lang=${this.lang.lang()}`];
    if (excludeIds.length) parts.push(`excludeIds=${encodeURIComponent(excludeIds.join(','))}`);
    return this.http.get<MayhemQuestion[]>(`${this.base}/mode/questions?${parts.join('&')}`, { headers: this.headers() });
  }

  checkAnswer(questionId: string, selectedAnswer: string) {
    return this.http.post<MayhemAnswerResponse>(`${this.base}/mode/answer`, { questionId, selectedAnswer, lang: this.lang.lang() }, { headers: this.headers() });
  }

  startSession(language = 'en') {
    return this.http.post<MayhemSessionResponse>(`${this.base}/session`, { language }, { headers: this.headers() });
  }

  submitSessionAnswer(sessionId: string, questionId: string, selectedAnswer: string) {
    return this.http.post<MayhemSessionAnswerResponse>(
      `${this.base}/session/${sessionId}/answer`,
      { questionId, selectedAnswer, lang: this.lang.lang() },
      { headers: this.headers() },
    );
  }

  endSession(sessionId: string) {
    return this.http.post<MayhemEndSessionResponse>(`${this.base}/session/${sessionId}/end`, {}, { headers: this.headers() });
  }

  getLeaderboard() {
    return this.http.get<MayhemLeaderboardEntry[]>(`${this.base}/leaderboard`);
  }

  getMyLeaderboardEntry() {
    return this.http.get<MayhemMeEntry | null>(`${this.base}/leaderboard/me`, { headers: this.headers() });
  }
}
