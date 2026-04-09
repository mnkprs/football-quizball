import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { UpdateService } from '../../core/update.service';

@Component({
  selector: 'app-force-update-banner',
  standalone: true,
  templateUrl: './force-update-banner.html',
  styleUrl: './force-update-banner.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForceUpdateBannerComponent {
  readonly update = inject(UpdateService);

  openStore(): void {
    const url = this.update.storeUrl();
    if (url) {
      window.open(url, '_system');
    }
  }

  dismiss(): void {
    this.update.mode.set('none');
  }
}
