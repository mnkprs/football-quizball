import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface NewsMetadata {
  round_id: string | null;
  questions_total: number;
  questions_remaining: number;
  expires_at: string | null;
  round_created_at: string | null;
  streak: number;
  max_streak: number;
}

export interface NewsQuestion {
  id: string;
  question_text: string;
  fifty_fifty_hint: string | null;
  wrong_choices: string[] | null;
  source_url: string | null;
}

export interface NewsAnswerResponse {
  correct: boolean;
  correct_answer: string;
  explanation: string;
}

@Injectable({ providedIn: 'root' })
export class NewsApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/news`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getMetadata(): Observable<NewsMetadata> {
    return this.http.get<NewsMetadata>(`${this.base}/metadata`, { headers: this.headers() });
  }

  getQuestions(): Observable<NewsQuestion[]> {
    return this.http.get<NewsQuestion[]>(`${this.base}/mode/questions`, { headers: this.headers() });
  }

  checkAnswer(questionId: string, answer: string) {
    return this.http.post<NewsAnswerResponse>(`${this.base}/mode/answer`, { questionId, answer }, { headers: this.headers() });
  }
}
