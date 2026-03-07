import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CreateGameRequest {
  player1Name: string;
  player2Name: string;
}

export interface CreateGameResponse {
  game_id: string;
  players: Array<{ name: string; score: number }>;
  question_count: number;
  status: string;
}

export interface BoardState {
  id: string;
  status: 'ACTIVE' | 'FINISHED';
  players: Array<{ name: string; score: number; lifelineUsed: boolean; doubleUsed: boolean }>;
  currentPlayerIndex: 0 | 1;
  board: BoardCell[][];
  categories: Array<{ key: string; label: string }>;
}

export interface BoardCell {
  question_id: string;
  category: string;
  category_label: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  answered: boolean;
  answered_by?: string;
}

export interface Question {
  id: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  question_text: string;
  fifty_fifty_applicable: boolean;
  image_url: string | null;
  meta?: Record<string, unknown>;
}

export interface AnswerResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
}

export interface HintResult {
  hint: string;
  points_if_correct: number;
}

export interface Double2xResult {
  points_if_correct: number;
}

@Injectable({ providedIn: 'root' })
export class GameApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  createGame(req: CreateGameRequest): Observable<CreateGameResponse> {
    return this.http.post<CreateGameResponse>(`${this.base}/api/games`, req);
  }

  getGame(gameId: string): Observable<BoardState> {
    return this.http.get<BoardState>(`${this.base}/api/games/${gameId}`);
  }

  getQuestion(gameId: string, questionId: string): Observable<Question> {
    return this.http.get<Question>(`${this.base}/api/games/${gameId}/questions/${questionId}`);
  }

  submitAnswer(gameId: string, questionId: string, answer: string, playerIndex: 0 | 1): Observable<AnswerResult> {
    return this.http.post<AnswerResult>(`${this.base}/api/games/${gameId}/answer`, {
      questionId,
      answer,
      playerIndex,
    });
  }

  useLifeline(gameId: string, questionId: string, playerIndex: 0 | 1): Observable<HintResult> {
    return this.http.post<HintResult>(`${this.base}/api/games/${gameId}/fifty`, {
      questionId,
      playerIndex,
    });
  }

  use2x(gameId: string, questionId: string, playerIndex: 0 | 1): Observable<Double2xResult> {
    return this.http.post<Double2xResult>(`${this.base}/api/games/${gameId}/double`, {
      questionId,
      playerIndex,
    });
  }

  overrideAnswer(gameId: string, questionId: string, isCorrect: boolean, playerIndex: 0 | 1): Observable<AnswerResult> {
    return this.http.post<AnswerResult>(`${this.base}/api/games/${gameId}/override`, {
      questionId,
      isCorrect,
      playerIndex,
    });
  }

  endGame(gameId: string): Observable<{ game_id: string; status: string; final_scores: [number, number]; winner: string }> {
    return this.http.post<any>(`${this.base}/api/games/${gameId}/end`, {});
  }
}
