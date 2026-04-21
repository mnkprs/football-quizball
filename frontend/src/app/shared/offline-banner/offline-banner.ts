import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { NetworkService } from '../../core/network.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  templateUrl: './offline-banner.html',
  styleUrl: './offline-banner.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineBannerComponent {
  readonly network = inject(NetworkService);
}
