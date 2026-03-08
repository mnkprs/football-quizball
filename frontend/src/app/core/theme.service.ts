import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'quizball_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _dark = signal<boolean>(this.readStored());
  readonly isDark = this._dark.asReadonly();

  private readStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'light';
    } catch { return true; }
  }

  toggle(): void {
    const next = !this._dark();
    this._dark.set(next);
    try { localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light'); } catch {}
    document.documentElement.classList.toggle('dark', next);
  }
}
