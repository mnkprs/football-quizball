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

export interface SeedPoolSession {
  id: string;
  created_at: string;
  total_added: number;
  target: number;
}

export interface ScoreThresholds {
  rawThresholdEasy: number;
  rawThresholdMedium: number;
  boundaryTolerance: number;
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

  getSeedPoolSessions(apiKey?: string): Observable<SeedPoolSession[]> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get<SeedPoolSession[]>(`${this.base}/api/admin/seed-pool-sessions`, { headers });
  }

  getSessionQuestions(sessionId: string, apiKey?: string): Observable<PoolQuestionRow[]> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get<PoolQuestionRow[]>(`${this.base}/api/admin/seed-pool-sessions/${sessionId}/questions`, {
      headers,
    });
  }

  getPoolQuestions(
    min: number,
    max: number,
    page: number = 1,
    limit: number = 20,
    search?: string,
    category?: string,
    difficulty?: string,
    apiKey?: string,
  ): Observable<PoolQuestionsResponse> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    const params: Record<string, string> = { min: String(min), max: String(max), page: String(page), limit: String(limit) };
    if (search?.trim()) params['search'] = search.trim();
    if (category?.trim()) params['category'] = category.trim();
    if (difficulty?.trim()) params['difficulty'] = difficulty.trim();
    return this.http.get<PoolQuestionsResponse>(`${this.base}/api/admin/pool-questions`, {
      headers,
      params,
    });
  }

  /** Seed the question pool. target: number of questions per slot (default 100). */
  seedPool(target?: number, apiKey?: string): Observable<{ target: number; totalAdded: number; results: unknown[] }> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    const params: Record<string, string> = target != null ? { target: String(target) } : {};
    return this.http.post<{ target: number; totalAdded: number; results: unknown[] }>(
      `${this.base}/api/admin/seed-pool`,
      null,
      { headers, params },
    );
  }

  /** Seed the blitz question pool. target: optional count per band. */
  seedBlitzPool(target?: number, apiKey?: string): Observable<{ target: number | string; totalAdded: number; results: unknown[] }> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    const params: Record<string, string> = target != null ? { target: String(target) } : {};
    return this.http.post<{ target: number | string; totalAdded: number; results: unknown[] }>(
      `${this.base}/api/admin/seed-blitz-pool`,
      null,
      { headers, params },
    );
  }

  /** Cleanup invalid and duplicate questions in both pools. */
  cleanupQuestions(apiKey?: string): Observable<{ question_pool: unknown; blitz_question_pool: unknown }> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.post<{ question_pool: unknown; blitz_question_pool: unknown }>(
      `${this.base}/api/admin/cleanup-questions`,
      null,
      { headers },
    );
  }

  /** Dedupe wrong_choices in blitz_question_pool. */
  dedupeBlitzWrongChoices(apiKey?: string): Observable<{ updated: number }> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.post<{ updated: number }>(
      `${this.base}/api/admin/dedupe-blitz-wrong-choices`,
      null,
      { headers },
    );
  }

  /** Find duplicate answers (same correct_answer in category/difficulty). */
  findDuplicateAnswers(apiKey?: string): Observable<DuplicateAnswersResponse> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get<DuplicateAnswersResponse>(`${this.base}/api/admin/duplicate-answers`, { headers });
  }

  /** Find similar questions by entity overlap. */
  findSimilarQuestions(apiKey?: string): Observable<SimilarQuestionsResponse> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get<SimilarQuestionsResponse>(`${this.base}/api/admin/similar-questions`, { headers });
  }

  /** Get DB stats (row counts). */
  getDbStats(apiKey?: string): Observable<DbStatsResponse> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get<DbStatsResponse>(`${this.base}/api/admin/db-stats`, { headers });
  }

  /** Get current difficulty score thresholds. */
  getThresholds(apiKey?: string): Observable<ScoreThresholds> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get<ScoreThresholds>(`${this.base}/api/admin/thresholds`, { headers });
  }

  /** Update difficulty score thresholds. */
  updateThresholds(body: Partial<ScoreThresholds>, apiKey?: string): Observable<ScoreThresholds> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.put<ScoreThresholds>(`${this.base}/api/admin/thresholds`, body, { headers });
  }

  /** Get heatmap HTML report (blob for download). */
  getHeatmapHtml(apiKey?: string): Observable<Blob> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    return this.http.get(`${this.base}/api/admin/heatmap-html`, {
      headers,
      responseType: 'blob',
    });
  }

  /** Re-score question_pool and optionally apply difficulty/raw_score updates. Same as npm run pool:migrate-difficulty:apply. */
  migratePoolDifficulty(
    options?: { apply?: boolean; slot?: string; range?: string; locale?: string },
    apiKey?: string,
  ): Observable<MigratePoolDifficultyResponse> {
    const key = apiKey ?? this.apiKey;
    const headers = key ? new HttpHeaders({ 'x-admin-key': key }) : undefined;
    const params: Record<string, string> = {};
    if (options?.apply) params['apply'] = 'true';
    if (options?.slot?.trim()) params['slot'] = options.slot.trim();
    if (options?.range?.trim()) params['range'] = options.range.trim();
    if (options?.locale?.trim()) params['locale'] = options.locale.trim();
    return this.http.post<MigratePoolDifficultyResponse>(
      `${this.base}/api/admin/migrate-pool-difficulty`,
      null,
      { headers, params },
    );
  }
}

export interface MigratePoolDifficultyChange {
  id: string;
  question_text: string;
  change: string;
  question_version: string | null;
}

export interface MigratePoolDifficultyResponse {
  scanned: number;
  updated: number;
  wouldUpdate: number;
  rejected: number;
  changes: MigratePoolDifficultyChange[];
  generationVersion: string;
  thresholds: { rawThresholdEasy: number; rawThresholdMedium: number; boundaryTolerance: number };
}

export interface DuplicateAnswerGroup {
  answer: string;
  count: number;
  ids: string[];
  questions: string[];
}

export interface DuplicateAnswersResponse {
  question_pool: DuplicateAnswerGroup[];
  blitz_question_pool: DuplicateAnswerGroup[];
}

export interface SimilarPair {
  a: { id: string; category: string; question: { question_text?: string } };
  b: { id: string; category: string; question: { question_text?: string } };
  score: number;
  reasons: string[];
}

export interface SimilarQuestionsResponse {
  question_pool: SimilarPair[];
  blitz_question_pool: SimilarPair[];
}

export interface DbStatsResponse {
  question_pool: { total: number; unanswered: number; news_unanswered: number };
  questions_v1: { total: number };
  blitz_question_pool: { total: number; unanswered: number };
  daily_questions: { rows: number };
}
