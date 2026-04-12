import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { LevelUpService } from '../../core/level-up.service';

@Component({
  selector: 'app-level-up-overlay',
  standalone: true,
  templateUrl: './level-up-overlay.html',
  styleUrl: './level-up-overlay.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelUpOverlayComponent {
  levelUp = inject(LevelUpService);
}
