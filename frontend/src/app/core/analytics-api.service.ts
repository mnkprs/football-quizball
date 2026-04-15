import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface AccuracyBreakdown {
  bucket: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface AnalyticsSummary {
  totals: {
    questions_answered: number;
    correct: number;
    accuracy: number;
    current_elo: number;
    peak_elo: number;
    days_active: number;
  };
  elo_trajectory: Array<{ t: string; elo: number }>;
  by_difficulty: AccuracyBreakdown[];
  by_era: AccuracyBreakdown[];
  by_competition_type: AccuracyBreakdown[];
  by_league_tier: AccuracyBreakdown[];
  by_category: AccuracyBreakdown[];
  strongest: AccuracyBreakdown | null;
  weakest: AccuracyBreakdown | null;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getMySummary(): Promise<AnalyticsSummary> {
    return firstValueFrom(
      this.http.get<AnalyticsSummary>(`${environment.apiUrl}/api/analytics/me`, {
        headers: this.headers(),
      }),
    );
  }
}
