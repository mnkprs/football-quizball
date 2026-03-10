import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

const STORAGE_KEY = 'quizball_donate_dismissed';

@Injectable({ providedIn: 'root' })
export class DonateModalService {
  readonly showModal = signal(false);

  /** Call when a match finishes. Shows modal only if not dismissed and URL is set. */
  considerShowing(): void {
    if (!environment.buyMeACoffeeUrl) return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;
    this.showModal.set(true);
  }

  dismiss(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    this.showModal.set(false);
  }

  get supportUrl(): string {
    return environment.buyMeACoffeeUrl ?? '';
  }
}
