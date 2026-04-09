import { Injectable, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { firstValueFrom, catchError, of } from 'rxjs';
import { ConfigApiService, type VersionConfig } from './config-api.service';
import { PlatformService } from './platform.service';

export type UpdateMode = 'none' | 'soft' | 'force';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private configApi = inject(ConfigApiService);
  private platform = inject(PlatformService);

  readonly mode = signal<UpdateMode>('none');
  readonly storeUrl = signal('');

  async check(): Promise<void> {
    if (!this.platform.isNative) return;

    try {
      const [info, config] = await Promise.all([
        App.getInfo(),
        firstValueFrom(
          this.configApi.getVersionConfig().pipe(catchError(() => of(null))),
        ),
      ]);

      if (!config) return;

      const current = info.version; // e.g. "1.7.0"

      // Resolve store URL for the current platform
      const url = this.platform.isIos
        ? config.updateUrl.ios
        : config.updateUrl.android;
      this.storeUrl.set(url);

      if (this.isOlderThan(current, config.minVersion)) {
        this.mode.set('force');
      } else if (this.isOlderThan(current, config.latestVersion)) {
        this.mode.set('soft');
      }
    } catch {
      // Non-critical — don't block app startup
    }
  }

  /** Returns true if `a` is strictly older than `b` (semver major.minor.patch). */
  private isOlderThan(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const va = pa[i] ?? 0;
      const vb = pb[i] ?? 0;
      if (va < vb) return true;
      if (va > vb) return false;
    }
    return false;
  }
}
