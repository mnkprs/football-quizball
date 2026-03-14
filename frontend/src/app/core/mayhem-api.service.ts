import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { LanguageService } from './language.service';

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

@Injectable({ providedIn: 'root' })
export class MayhemApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private lang = inject(LanguageService);

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getQuestions(excludeIds: string[] = []) {
    const parts: string[] = [`lang=${this.lang.lang()}`];
    if (excludeIds.length) parts.push(`excludeIds=${encodeURIComponent(excludeIds.join(','))}`);
    return this.http.get<MayhemQuestion[]>(`/api/mayhem/mode/questions?${parts.join('&')}`, { headers: this.headers() });
  }

  checkAnswer(questionId: string, selectedAnswer: string) {
    return this.http.post<MayhemAnswerResponse>('/api/mayhem/mode/answer', { questionId, selectedAnswer }, { headers: this.headers() });
  }
}
