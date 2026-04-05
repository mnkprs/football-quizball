import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { type AdConfig, AdService } from './ad.service';

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private http = inject(HttpClient);
  private adService = inject(AdService);
  private base = `${environment.apiUrl}/api/config`;

  async loadAdConfig(): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.http.get<AdConfig>(`${this.base}/ads`),
      );
      this.adService.setConfig(config);
    } catch {
      // Use defaults — non-fatal
    }
  }
}
