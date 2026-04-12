import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LevelUpService {
  readonly activeLevel = signal<number | null>(null);

  show(level: number): void {
    this.activeLevel.set(level);
    setTimeout(() => this.activeLevel.set(null), 2500);
  }
}
