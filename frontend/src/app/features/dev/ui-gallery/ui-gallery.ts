import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  SoAnswerCardComponent,
  SoAvatarComponent,
  SoButtonComponent,
  SoChipComponent,
  SoIconButtonComponent,
  SoLeaderboardRowComponent,
  SoModeCardComponent,
  SoModeRowComponent,
  SoProgressTrackComponent,
  SoRankBadgeComponent,
  SoStatCardComponent,
  SoTopBarComponent,
} from '@app/shared/ui';

@Component({
  selector: 'app-ui-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SoAnswerCardComponent,
    SoAvatarComponent,
    SoButtonComponent,
    SoChipComponent,
    SoIconButtonComponent,
    SoLeaderboardRowComponent,
    SoModeCardComponent,
    SoModeRowComponent,
    SoProgressTrackComponent,
    SoRankBadgeComponent,
    SoStatCardComponent,
    SoTopBarComponent,
  ],
  templateUrl: './ui-gallery.html',
  styleUrl: './ui-gallery.css',
})
export class UiGalleryComponent {}
