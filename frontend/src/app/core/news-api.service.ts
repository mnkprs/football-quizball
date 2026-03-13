import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';

export interface NewsQuestion {
  id: string;
  question_text: string;
  fifty_fifty_hint: string | null;
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

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getQuestions(excludeIds: string[] = []) {
    const params = excludeIds.length ? `?excludeIds=${encodeURIComponent(excludeIds.join(','))}` : '';
    return this.http.get<NewsQuestion[]>(`/api/news/mode/questions${params}`, { headers: this.headers() });
  }

  checkAnswer(questionId: string, answer: string) {
    return this.http.post<NewsAnswerResponse>('/api/news/mode/answer', { questionId, answer }, { headers: this.headers() });
  }
}
