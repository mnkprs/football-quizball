import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type OnboardingCategory =
  | 'LOGO_QUIZ'
  | 'HIGHER_OR_LOWER'
  | 'GEOGRAPHY'
  | 'HISTORY'
  | 'PLAYER_ID';

export interface OnboardingQuestion {
  category: OnboardingCategory;
  prompt: string;
  image_url?: string;
  original_image_url?: string;
  choices: string[];
  correct_answer: string;
  explanation: string;
}

export interface OnboardingQuestionsResponse {
  questions: OnboardingQuestion[];
}

@Injectable({ providedIn: 'root' })
export class OnboardingApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/onboarding`;

  getQuestions(): Observable<OnboardingQuestionsResponse> {
    return this.http.get<OnboardingQuestionsResponse>(`${this.base}/questions`);
  }
}
