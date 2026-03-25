import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'quizball_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _dark = signal<boolean>(this.readStored());
  readonly isDark = this._dark.asReadonly();

  private readStored(): boolean {
    // Always start in dark mode — light mode is only for local 2-player game sessions
    return true;
  }

  toggle(): void {
    const next = !this._dark();
    this._dark.set(next);
    document.documentElement.classList.toggle('dark', next);
  }

  /** Reset to dark mode (call when leaving local game pages) */
  resetToDark(): void {
    if (!this._dark()) {
      this._dark.set(true);
      document.documentElement.classList.add('dark');
    }
  }
}
