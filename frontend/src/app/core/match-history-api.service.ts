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
}
