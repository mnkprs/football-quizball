import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  async setUsername(username: string): Promise<void> {
    const token = this.auth.accessToken();
    if (!token) throw new Error('Not authenticated');

    await firstValueFrom(
      this.http.patch(
        `${environment.apiUrl}/api/profile/username`,
        { username },
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
      ),
    );
  }
}
