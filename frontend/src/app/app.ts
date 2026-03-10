import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DonateModalComponent } from './shared/donate-modal/donate-modal';
import { DonateModalService } from './core/donate-modal.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DonateModalComponent],
  template: `
    <div class="app-container">
      <router-outlet />
      @if (donateService.showModal()) {
        <app-donate-modal />
      }
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100dvh;
      max-width: 28rem;
      margin: 0 auto;
      background: var(--mat-sys-surface);
    }
  `],
})
export class App {
  donateService = inject(DonateModalService);
}
