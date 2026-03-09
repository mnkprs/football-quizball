import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DailyQuestionRef {
  question_text: string;
  correct_answer: string;
  choices: string[];
  explanation: string;
}

export interface DailyQuestionsResponse {
  questions: DailyQuestionRef[];
}

export interface DailyMetadata {
  count: number;
  resetsAt: string;
}

@Injectable({ providedIn: 'root' })
export class DailyApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/daily`;

  getQuestions(): Observable<DailyQuestionsResponse> {
    return this.http.get<DailyQuestionsResponse>(`${this.base}/questions`);
  }

  getMetadata(): Observable<DailyMetadata> {
    return this.http.get<DailyMetadata>(`${this.base}/metadata`);
  }
}
