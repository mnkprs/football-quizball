import { Injectable, signal, computed, inject } from '@angular/core';
import type { UnlockedAchievement } from './solo-api.service';
import { FeedbackService } from './feedback.service';

@Injectable({ providedIn: 'root' })
export class AchievementUnlockService {
  private feedback = inject(FeedbackService);

  readonly achievements = signal<UnlockedAchievement[]>([]);
  readonly showModal = computed(() => this.achievements().length > 0);

  show(unlocked: UnlockedAchievement[]): void {
    if (unlocked.length > 0) {
      this.achievements.set(unlocked);
      this.feedback.achievementUnlock();
    }
  }

  dismiss(): void {
    this.achievements.set([]);
  }
}
