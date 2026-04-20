import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

/**
 * Shape of GET /api/logo-quiz/question — intentionally omits answer-revealing
 * fields. team_name / slug / league / country / original_image_url now arrive
 * only on the POST /answer reveal response (see LogoAnswerResponse).
 */
export interface LogoQuestionResponse {
  id: string;
  difficulty: 'EASY' | 'HARD';
  image_url: string;
  question_elo?: number;
}

export interface LogoAnswerResponse {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  /** Unobscured logo — revealed only after submission. */
  original_image_url?: string;
  /** Metadata revealed only after submission (reveal screen + profile surface). */
  team_metadata?: { slug: string; league: string; country: string };
  elo_before: number;
  elo_after: number;
  elo_change: number;
  elo_capped?: boolean;
  rejected_too_fast?: boolean;
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

  checkAchievements(sessionCorrect: number): Observable<{ newly_unlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }> }> {
    return this.http.post<{ newly_unlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }> }>(
      `${this.base}/check-achievements`,
      { session_correct: sessionCorrect },
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
