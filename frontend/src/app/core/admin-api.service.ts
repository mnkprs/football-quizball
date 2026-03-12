import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SlotRawStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  std: number;
  withRaw: number;
}

export interface SeedPoolStatsRow {
  category: string;
  difficulty: string;
  unanswered: number;
  answered: number;
  drawable_unanswered: number;
  drawable_answered: number;
}

export interface PoolQuestionRow {
  id: string;
  category: string;
  difficulty: string;
  raw_score: number;
  question_text: string;
  correct_answer: string;
}

export interface PoolQuestionsResponse {
  questions: PoolQuestionRow[];
  total: number;
}

export interface PoolRawScoreStats {
  totalRows: number;
  withRawScore: number;
  overallAvg: number;
  overallStd: number;
  categories: string[];
  difficulties: string[];
  slotStats: Record<string, SlotRawStats>;
  bucketCounts: Record<string, number>;
  buckets: number;
  seedPoolStats?: SeedPoolStatsRow[];
  fetchedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /** API key for admin endpoints. From environment or set manually for local dev. */
  private apiKey: string | null = environment.adminApiKey ?? null;

  setApiKey(key: string): void {
    this.apiKey = key || null;
  }

  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  getPoolStats(apiKey?: string): Observable<PoolRawScoreStats> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get<PoolRawScoreStats>(`${this.base}/api/admin/pool-stats`, { headers });
  }

  getPoolQuestions(
    min: number,
    max: number,
    page: number = 1,
    limit: number = 20,
    search?: string,
    apiKey?: string,
  ): Observable<PoolQuestionsResponse> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    const params: Record<string, string> = { min: String(min), max: String(max), page: String(page), limit: String(limit) };
    if (search?.trim()) params['search'] = search.trim();
    return this.http.get<PoolQuestionsResponse>(`${this.base}/api/admin/pool-questions`, {
      headers,
      params,
    });
  }
}
