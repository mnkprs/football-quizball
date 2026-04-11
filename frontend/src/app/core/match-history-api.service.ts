import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface MatchHistoryEntry {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_username: string;
  player2_username: string;
  winner_id: string | null;
  player1_score: number;
  player2_score: number;
  match_mode: string;
  played_at: string;
  game_ref_id: string | null;
  game_ref_type: string | null;
}

export interface SaveMatchPayload {
  player1_id: string;
  player2_id: string | null;
  player1_username: string;
  player2_username: string;
  winner_id: string | null;
  player1_score: number;
  player2_score: number;
  match_mode: 'local' | 'online';
  game_ref_id?: string;
  game_ref_type?: string;
}

export interface DuelQuestionDetail {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
  is_pro_logo?: boolean;
}

export interface OnlineBoardCellDetail {
  category: string;
  difficulty: string;
  points: number;
  answered_by?: string;
}

export interface OnlinePlayerDetail {
  name: string;
  score: number;
  lifelineUsed: boolean;
  doubleUsed: boolean;
}

export interface BRPlayerDetail {
  username: string;
  score: number;
  rank?: number;
  teamId?: number;
}

export interface MatchDetail extends MatchHistoryEntry {
  question_results?: DuelQuestionDetail[];
  board?: OnlineBoardCellDetail[][];
  players?: OnlinePlayerDetail[];
  categories?: Array<{ key: string; label: string }>;
  br_players?: BRPlayerDetail[];
  br_mode?: string;
  team_scores?: { team1: number; team2: number };
  mvp?: { username: string; score: number };
}

@Injectable({ providedIn: 'root' })
export class MatchHistoryApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/match-history`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getHistory(userId: string) {
    return this.http.get<MatchHistoryEntry[]>(`${this.base}/${userId}`);
  }

  saveMatch(payload: SaveMatchPayload) {
    return this.http.post<{ ok: boolean }>(`${this.base}`, payload, { headers: this.headers() });
  }

  getMatchDetail(matchId: string) {
    return this.http.get<MatchDetail>(`${this.base}/${matchId}/details`, { headers: this.headers() });
  }
}
