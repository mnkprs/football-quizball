import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { type AdConfig, AdService } from './ad.service';

export interface VersionConfig {
  minVersion: string;
  latestVersion: string;
  updateUrl: {
    ios: string;
    android: string;
  };
}

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

  getVersionConfig(): Observable<VersionConfig> {
    return this.http.get<VersionConfig>(`${this.base}/version`);
  }
}
