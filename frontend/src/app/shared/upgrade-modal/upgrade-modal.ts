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

  selectedPlan = signal<'monthly' | 'yearly' | 'lifetime'>('yearly');
  state = signal<'idle' | 'loading' | 'purchasing' | 'success' | 'error'>('loading');
  errorMessage = signal('');

  /** Localized product info from the native store. */
  monthlyProduct = signal<IAPProduct | null>(null);
  yearlyProduct = signal<IAPProduct | null>(null);
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
      this.monthlyProduct.set(products.find(p => p.id === 'stepovr_pro_monthly') ?? null);
      this.yearlyProduct.set(products.find(p => p.id === 'stepovr_pro_yearly') ?? null);
      this.lifetimeProduct.set(products.find(p => p.id === 'stepovr_pro_lifetime') ?? null);
      this.state.set('idle');
    } catch {
      // Fallback — show hardcoded prices
      this.state.set('idle');
    }
  }

  selectPlan(plan: 'monthly' | 'yearly' | 'lifetime'): void {
    this.selectedPlan.set(plan);
  }

  get selectedPrice(): string {
    switch (this.selectedPlan()) {
      case 'monthly': return this.monthlyProduct()?.price ?? '$3.99/mo';
      case 'yearly': return this.yearlyProduct()?.price ?? '$14.99/yr';
      case 'lifetime': return this.lifetimeProduct()?.price ?? '$19.99';
    }
  }

  get selectedCtaLabel(): string {
    switch (this.selectedPlan()) {
      case 'monthly': {
        const price = this.monthlyProduct()?.price ?? '$3.99';
        return `Continue — ${price}/mo`;
      }
      case 'yearly': {
        const price = this.yearlyProduct()?.price ?? '$14.99';
        return `Continue — ${price}/yr`;
      }
      case 'lifetime': {
        const price = this.lifetimeProduct()?.price ?? '$19.99';
        return `Continue — ${price}`;
      }
    }
  }

  get yearlySavingsLabel(): string {
    const monthlyPrice = this.monthlyProduct()?.priceMicros ?? 3990000;
    const yearlyPrice = this.yearlyProduct()?.priceMicros ?? 14990000;
    const monthlyEquiv = yearlyPrice / 12;
    const savings = Math.round((1 - monthlyEquiv / monthlyPrice) * 100);
    return `Save ${savings}%`;
  }

  async subscribe(): Promise<void> {
    if (this.state() === 'purchasing') return; // prevent double-tap
    this.state.set('purchasing');
    this.errorMessage.set('');

    try {
      switch (this.selectedPlan()) {
        case 'monthly': await this.iap.purchaseMonthly(); break;
        case 'yearly': await this.iap.purchaseYearly(); break;
        case 'lifetime': await this.iap.purchaseLifetime(); break;
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
