import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ProService } from '../../core/pro.service';

@Component({
  selector: 'app-upgrade-modal',
  standalone: true,
  templateUrl: './upgrade-modal.html',
  styleUrl: './upgrade-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradeModalComponent {
  pro = inject(ProService);

  close(): void {
    this.pro.showUpgradeModal.set(false);
  }

  async subscribe(): Promise<void> {
    await this.pro.createCheckout();
  }
}
