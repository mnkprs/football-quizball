import { Injectable, inject, signal } from '@angular/core';
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

export interface FeatureFlags {
  modes: {
    battleRoyale: boolean;
    duel: boolean;
    solo: boolean;
    blitz: boolean;
    mayhem: boolean;
    logoQuiz: boolean;
    twoPlayer: boolean;
    daily: boolean;
  };
  maintenance: {
    enabled: boolean;
    message: string;
  };
  purchases: {
    enabled: boolean;
  };
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  modes: {
    battleRoyale: true,
    duel: true,
    solo: true,
    blitz: true,
    mayhem: true,
    logoQuiz: true,
    twoPlayer: true,
    daily: true,
  },
  maintenance: { enabled: false, message: '' },
  purchases: { enabled: true },
};

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private http = inject(HttpClient);
  private adService = inject(AdService);
  private base = `${environment.apiUrl}/api/config`;

  readonly featureFlags = signal<FeatureFlags>(DEFAULT_FEATURE_FLAGS);

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

  async loadFeatureFlags(): Promise<void> {
    try {
      const flags = await firstValueFrom(
        this.http.get<FeatureFlags>(`${this.base}/feature-flags`),
      );
      this.featureFlags.set(flags);
    } catch {
      // Use defaults — non-fatal (e.g. offline at app start)
    }
  }
}
