import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { AchievementUnlockService } from '../../core/achievement-unlock.service';
import { LanguageService } from '../../core/language.service';
import { ScrollLockService } from '../../core/scroll-lock.service';

@Component({
  selector: 'app-achievement-unlock-modal',
  standalone: true,
  imports: [],
  templateUrl: './achievement-unlock-modal.html',
  styleUrl: './achievement-unlock-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AchievementUnlockModalComponent {
  unlockService = inject(AchievementUnlockService);
  lang = inject(LanguageService);

  constructor() {
    inject(ScrollLockService).acquireForLifetime();
  }

  onDismiss(): void {
    this.unlockService.dismiss();
  }
}
