import { Component, inject } from '@angular/core';
import { DonateModalService } from '../../core/donate-modal.service';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-donate-modal',
  standalone: true,
  imports: [],
  template: `
    <div class="donate-backdrop" (click)="onDismiss()">
      <div class="donate-dialog" (click)="$event.stopPropagation()">
        <div class="donate-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.333 2.586 2.333l8.039-.001c2.49 0 4.582-2.003 4.582-2.003s2.849-1.985 2.849-2.209c0-.224-.224-1.985-.224-1.985s-.224-.45.449-.45h2.735s.673 0 .9.673c.225.673.224 2.209.224 2.209s.011.505.314.786c.303.281.976.112.976.112s3.062-.562 3.533-4.073c.472-3.512-.328-5.477-.328-5.477s-.449-.9-1.348-1.348-2.694-.9-2.694-.9z"/>
          </svg>
        </div>
        <h3 class="donate-title">{{ lang.t().donateModalTitle }}</h3>
        <p class="donate-message">{{ lang.t().donateModalMessage }}</p>
        <div class="donate-actions">
          <a
            [href]="donateService.supportUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="donate-btn donate-primary"
            (click)="onSupport()"
          >
            {{ lang.t().donateModalSupport }}
          </a>
          <button type="button" class="donate-btn donate-secondary" (click)="onDismiss()">
            {{ lang.t().donateModalMaybeLater }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .donate-backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: var(--color-surface-overlay, rgba(0, 0, 0, 0.6));
      -webkit-tap-highlight-color: transparent;
    }

    .donate-dialog {
      width: 100%;
      max-width: min(22rem, calc(100vw - 2rem));
      background: var(--mat-sys-surface, var(--color-card));
      border-radius: 1.25rem;
      padding: 1.5rem;
      border: 1px solid var(--mat-sys-outline-variant, var(--color-border));
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
      text-align: center;
    }

    .donate-icon {
      width: 3rem;
      height: 3rem;
      margin: 0 auto 1rem;
      padding: 0.5rem;
      background: linear-gradient(145deg, #ff6b4a 0%, #ff8f73 100%);
      border-radius: 1rem;
      color: #fff;
    }

    .donate-icon svg {
      width: 100%;
      height: 100%;
    }

    .donate-title {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--mat-sys-on-surface, var(--color-foreground));
    }

    .donate-message {
      margin: 0 0 1.5rem;
      font-size: 0.9375rem;
      line-height: 1.5;
      color: var(--mat-sys-on-surface-variant, var(--color-muted-foreground));
    }

    .donate-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .donate-btn {
      padding: 0.75rem 1.25rem;
      border-radius: 0.75rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      text-align: center;
      transition: opacity 0.2s, transform 0.15s;
      -webkit-tap-highlight-color: transparent;
    }

    .donate-btn:active {
      transform: scale(0.98);
    }

    .donate-primary {
      background: linear-gradient(145deg, #ff6b4a 0%, #ff8f73 100%);
      color: #fff;
    }

    .donate-primary:hover {
      opacity: 0.95;
    }

    .donate-secondary {
      background: var(--mat-sys-surface-container-highest, rgba(0, 0, 0, 0.08));
      color: var(--mat-sys-on-surface-variant, var(--color-muted-foreground));
    }

    .donate-secondary:hover {
      opacity: 0.9;
    }
  `],
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
