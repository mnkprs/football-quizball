import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { ProService } from '../../core/pro.service';
import { IapService, IAPProduct } from '../../core/iap.service';

@Component({
  selector: 'app-upgrade-modal',
  standalone: true,
  templateUrl: './upgrade-modal.html',
  styleUrl: './upgrade-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradeModalComponent implements OnInit {
  pro = inject(ProService);
  iap = inject(IapService);
  private router = inject(Router);

  selectedPlan = signal<'monthly' | 'lifetime'>('lifetime');
  state = signal<'idle' | 'loading' | 'purchasing' | 'success' | 'error'>('loading');
  errorMessage = signal('');

  /** Localized product info from the native store. */
  monthlyProduct = signal<IAPProduct | null>(null);
  lifetimeProduct = signal<IAPProduct | null>(null);

  ngOnInit(): void {
    this.loadProducts();
  }

  private async loadProducts(): Promise<void> {
    this.state.set('loading');
    try {
      if (!this.iap.initialized()) {
        await this.iap.initialize();
      }
      const products = this.iap.getProducts();
      this.monthlyProduct.set(products.find(p => p.type === 'subscription') ?? null);
      this.lifetimeProduct.set(products.find(p => p.type === 'non-consumable') ?? null);
      this.state.set('idle');
    } catch {
      // Fallback — show hardcoded prices
      this.state.set('idle');
    }
  }

  selectPlan(plan: 'monthly' | 'lifetime'): void {
    this.selectedPlan.set(plan);
  }

  get selectedPrice(): string {
    if (this.selectedPlan() === 'monthly') {
      return this.monthlyProduct()?.price ?? '$2.99/mo';
    }
    return this.lifetimeProduct()?.price ?? '$9.99';
  }

  get selectedCtaLabel(): string {
    if (this.selectedPlan() === 'monthly') {
      const price = this.monthlyProduct()?.price ?? '$2.99';
      return `Continue — ${price}/mo`;
    }
    const price = this.lifetimeProduct()?.price ?? '$9.99';
    return `Continue — ${price}`;
  }

  async subscribe(): Promise<void> {
    if (this.state() === 'purchasing') return; // prevent double-tap
    this.state.set('purchasing');
    this.errorMessage.set('');

    try {
      if (this.selectedPlan() === 'monthly') {
        await this.iap.purchaseMonthly();
      } else {
        await this.iap.purchaseLifetime();
      }
      // Refresh pro status from backend
      await this.pro.loadStatus();

      if (this.pro.isPro()) {
        this.state.set('success');
      } else {
        // Purchase was likely cancelled (no error, not pro)
        this.state.set('idle');
      }
    } catch {
      this.state.set('error');
      this.errorMessage.set('Purchase failed. Please try again.');
    }
  }

  async restore(): Promise<void> {
    if (this.state() === 'purchasing') return;
    this.state.set('purchasing');
    this.errorMessage.set('');

    try {
      await this.iap.restore();
      await this.pro.loadStatus();

      if (this.pro.isPro()) {
        this.state.set('success');
      } else {
        this.state.set('idle');
        this.errorMessage.set('No previous purchase found for this account.');
      }
    } catch {
      this.state.set('error');
      this.errorMessage.set('Restore failed. Please try again.');
    }
  }

  /** Contextual CTA after successful purchase. */
  get successCtaLabel(): string {
    switch (this.pro.triggerContext()) {
      case 'duel': return 'Start a Duel';
      case 'battle-royale': return 'Enter Battle Royale';
      default: return 'Let\'s Go';
    }
  }

  onSuccessCta(): void {
    this.close();
    switch (this.pro.triggerContext()) {
      case 'duel':
        this.router.navigate(['/duel']);
        break;
      case 'battle-royale':
        this.router.navigate(['/battle-royale']);
        break;
      default:
        break;
    }
  }

  close(): void {
    this.pro.showUpgradeModal.set(false);
    this.state.set('idle');
    this.errorMessage.set('');
    this.pro.triggerContext.set('general');
  }

  /** Block backdrop dismiss while purchasing. */
  onBackdropClick(): void {
    if (this.state() === 'purchasing') return;
    this.close();
  }
}
