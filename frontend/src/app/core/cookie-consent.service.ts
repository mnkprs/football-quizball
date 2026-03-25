import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  private readonly STORAGE_KEY = 'cookie_consent';

  consentGiven = signal<boolean | null>(this.readStorage());
  adsAllowed = computed(() => this.consentGiven() === true);

  accept(): void {
    this.consentGiven.set(true);
    localStorage.setItem(this.STORAGE_KEY, 'accepted');
  }

  reject(): void {
    this.consentGiven.set(false);
    localStorage.setItem(this.STORAGE_KEY, 'rejected');
  }

  private readStorage(): boolean | null {
    const v = localStorage.getItem(this.STORAGE_KEY);
    if (v === 'accepted') return true;
    if (v === 'rejected') return false;
    return null;
  }
}
