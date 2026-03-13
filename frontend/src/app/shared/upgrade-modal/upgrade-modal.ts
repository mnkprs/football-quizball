import { Component, inject } from '@angular/core';
import { ProService } from '../../core/pro.service';

@Component({
  selector: 'app-upgrade-modal',
  standalone: true,
  template: `
    @if (pro.showUpgradeModal()) {
      <div class="modal-backdrop" (click)="close()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <span class="modal-icon">⚡</span>
            <h2 class="modal-title">QuizBall Pro</h2>
            <p class="modal-price">$1.99 / month</p>
          </div>

          <ul class="modal-features">
            <li>🏆 Solo ELO Ranked Ladder</li>
            <li>⚡ Blitz Speed Ladder</li>
            <li>📊 Full stats & history</li>
            <li>Unlimited ranked games</li>
          </ul>

          @if (pro.trialGamesUsed() > 0) {
            <p class="modal-trial-note">
              You've used all {{ pro.trialGamesUsed() }} of your 5 free trial games.
            </p>
          }

          <button class="btn-subscribe" (click)="subscribe()">
            Subscribe with Stripe
          </button>
          <button class="btn-close" (click)="close()">Maybe later</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .modal-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 1rem 1rem 0.5rem 0.5rem;
      padding: 1.5rem;
      width: 100%;
      max-width: 24rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .modal-header {
      text-align: center;
    }

    .modal-icon {
      font-size: 2.5rem;
    }

    .modal-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #fff;
      margin: 0.25rem 0 0;
    }

    .modal-price {
      color: #facc15;
      font-weight: 600;
      font-size: 1.1rem;
      margin: 0.25rem 0 0;
    }

    .modal-features {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      color: #d1d5db;
      font-size: 0.95rem;
    }

    .modal-trial-note {
      color: #f87171;
      font-size: 0.85rem;
      text-align: center;
      margin: 0;
    }

    .btn-subscribe {
      background: #facc15;
      color: #000;
      border: none;
      border-radius: 0.5rem;
      padding: 0.875rem;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
    }

    .btn-subscribe:hover {
      background: #fde047;
    }

    .btn-close {
      background: transparent;
      color: #6b7280;
      border: none;
      padding: 0.5rem;
      font-size: 0.9rem;
      cursor: pointer;
      width: 100%;
    }

    .btn-close:hover {
      color: #9ca3af;
    }
  `],
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
