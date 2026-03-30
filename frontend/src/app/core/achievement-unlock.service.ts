import { Injectable, signal, computed } from '@angular/core';
import type { UnlockedAchievement } from './solo-api.service';

@Injectable({ providedIn: 'root' })
export class AchievementUnlockService {
  readonly achievements = signal<UnlockedAchievement[]>([]);
  readonly showModal = computed(() => this.achievements().length > 0);

  show(unlocked: UnlockedAchievement[]): void {
    if (unlocked.length > 0) {
      this.achievements.set(unlocked);
    }
  }

  dismiss(): void {
    this.achievements.set([]);
  }
}
