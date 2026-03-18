import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DonateModalService } from '../../core/donate-modal.service';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-donate-modal',
  standalone: true,
  imports: [],
  templateUrl: './donate-modal.html',
  styleUrl: './donate-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateModalComponent {
  donateService = inject(DonateModalService);
  lang = inject(LanguageService);

  onSupport(): void {
    this.donateService.dismiss();
  }

  onDismiss(): void {
    this.donateService.dismiss();
  }
}
