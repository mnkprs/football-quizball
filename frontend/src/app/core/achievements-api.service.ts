import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class AchievementsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/achievements`;

  getForUser(userId: string) {
    return this.http.get<Achievement[]>(`${this.base}/${userId}`);
  }
}
