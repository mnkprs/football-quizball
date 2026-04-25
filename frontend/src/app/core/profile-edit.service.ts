import { Injectable, signal } from '@angular/core';

/**
 * Coordinates the single Edit Profile panel rendered by <app-top-nav>.
 * Any surface that needs an "edit profile" affordance (e.g. the profile
 * page hero pencil) calls open() — top-nav reacts via effect().
 *
 * Counter-signal pattern: reading openTrigger() inside an effect re-runs
 * it every time open() increments. Subscribers ignore the initial 0.
 */
@Injectable({ providedIn: 'root' })
export class ProfileEditService {
  private _trigger = signal(0);
  readonly openTrigger = this._trigger.asReadonly();

  private _saved = signal(0);
  readonly savedTrigger = this._saved.asReadonly();

  open(): void {
    this._trigger.update(n => n + 1);
  }

  /** Top-nav calls this after a successful save so other screens can refresh. */
  notifySaved(): void {
    this._saved.update(n => n + 1);
  }
}
