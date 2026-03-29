import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface LogoQuestionResponse {
  id: string;
  team_name: string;
  slug: string;
  league: string;
  country: string;
  difficulty: 'EASY' | 'HARD';
  image_url: string;
  original_image_url: string;
}

export interface LogoAnswerResponse {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
}

@Injectable({ providedIn: 'root' })
export class LogoQuizApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/logo-quiz`;

  /** Cached team names list (loaded once, shared across subscribers). */
  private teamNames$: Observable<string[]> | null = null;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  getQuestion(difficulty?: string, hardcore = false): Observable<LogoQuestionResponse> {
    const parts: string[] = [];
    if (difficulty) parts.push(`difficulty=${difficulty}`);
    if (hardcore) parts.push('hardcore=true');
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return this.http.get<LogoQuestionResponse>(
      `${this.base}/question${qs}`,
      { headers: this.headers() },
    );
  }

  submitAnswer(
    questionId: string,
    answer: string,
    timedOut = false,
    hardcore = false,
  ): Observable<LogoAnswerResponse> {
    return this.http.post<LogoAnswerResponse>(
      `${this.base}/answer`,
      { question_id: questionId, answer, timed_out: timedOut, hardcore },
      { headers: this.headers() },
    );
  }

  getTeamNames(): Observable<string[]> {
    if (!this.teamNames$) {
      this.teamNames$ = this.http
        .get<string[]>(`${this.base}/teams`)
        .pipe(shareReplay(1));
    }
    return this.teamNames$;
  }
}
