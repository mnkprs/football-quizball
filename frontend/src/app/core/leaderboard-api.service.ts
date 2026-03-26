import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { LeaderboardEntry } from './solo-api.service';
import type { BlitzLeaderboardEntry } from './blitz-api.service';

export type { LeaderboardEntry, BlitzLeaderboardEntry };

export interface LogoQuizLeaderboardEntry {
  id: string;
  username: string;
  logo_quiz_elo: number;
  logo_quiz_games_played: number;
}

export interface LeaderboardResponse {
  solo: LeaderboardEntry[];
  blitz: BlitzLeaderboardEntry[];
  logoQuiz: LogoQuizLeaderboardEntry[];
}

export interface MyLeaderboardEntriesResponse {
  soloMe: (LeaderboardEntry & { rank: number }) | null;
  blitzMe: (BlitzLeaderboardEntry & { rank: number }) | null;
  logoQuizMe: (LogoQuizLeaderboardEntry & { rank: number }) | null;
}

@Injectable({ providedIn: 'root' })
export class LeaderboardApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/leaderboard`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getLeaderboard(): Observable<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(this.base);
  }

  getMyLeaderboardEntries(): Observable<MyLeaderboardEntriesResponse> {
    return this.http.get<MyLeaderboardEntriesResponse>(`${this.base}/me`, {
      headers: this.headers(),
    });
  }
}
