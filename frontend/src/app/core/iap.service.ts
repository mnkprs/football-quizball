import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Wraps cordova-plugin-purchase for native IAP (Apple / Google).
 *
 * Import CdvPurchase at runtime only — it is injected by Capacitor at build time.
 * In browser dev mode the store will not be available; the service gracefully degrades.
 */

// CdvPurchase is a global injected by cordova-plugin-purchase at native build time.
// We declare it loosely here so the app compiles in browser dev mode without the plugin installed.
declare const CdvPurchase: any;

export interface IAPProduct {
  id: string;
  title: string;
  description: string;
  price: string;           // Localized price string, e.g. "$2.99"
  priceMicros: number;
  currency: string;
  type: 'subscription' | 'non-consumable';
}

const PRODUCT_MONTHLY = 'stepovr_pro_monthly';
const PRODUCT_LIFETIME = 'stepovr_pro_lifetime';

@Injectable({ providedIn: 'root' })
export class IapService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/subscription`;

  readonly products = signal<IAPProduct[]>([]);
  readonly purchasing = signal(false);
  readonly initialized = signal(false);

  private store: any = null;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /**
   * Register products and set up purchase listeners.
   * Call once at app startup (e.g. in APP_INITIALIZER or root component).
   */
  async initialize(): Promise<void> {
    if (this.initialized()) return;

    // CdvPurchase is a global added by the plugin
    if (typeof CdvPurchase === 'undefined') {
      console.warn('IapService: cordova-plugin-purchase not available (browser mode)');
      // Short-circuit future calls so the warning fires exactly once per session,
      // not every time upgrade-modal reopens. Callers should check `products()`
      // (or `store`) for actual IAP availability — `initialized()` only gates bootstrap.
      this.initialized.set(true);
      return;
    }

    const store = CdvPurchase.store;
    this.store = store;

    // Determine platform
    const platform =
      store.defaultPlatform() === CdvPurchase.Platform.APPLE_APPSTORE
        ? CdvPurchase.Platform.APPLE_APPSTORE
        : CdvPurchase.Platform.GOOGLE_PLAY;

    // Register products
    store.register([
      {
        id: PRODUCT_MONTHLY,
        type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
        platform,
      },
      {
        id: PRODUCT_LIFETIME,
        type: CdvPurchase.ProductType.NON_CONSUMABLE,
        platform,
      },
    ]);

    // Listen for approved transactions — validate receipt on backend
    store.when()
      .approved((transaction: any) => this.onApproved(transaction))
      .finished((transaction: any) => this.onFinished(transaction))
      .verified((receipt: any) => receipt.finish());

    // Initialize the store
    await store.initialize([platform]);

    // Map registered products to our IAPProduct interface
    this.refreshProducts();
    this.initialized.set(true);
  }

  /** Returns the current product list (call after initialize). */
  getProducts(): IAPProduct[] {
    return this.products();
  }

  /** Trigger native monthly subscription purchase. */
  async purchaseMonthly(): Promise<void> {
    await this.purchase(PRODUCT_MONTHLY);
  }

  /** Trigger native lifetime purchase. */
  async purchaseLifetime(): Promise<void> {
    await this.purchase(PRODUCT_LIFETIME);
  }

  /** Restore previous purchases (required by Apple guidelines). */
  async restore(): Promise<void> {
    if (!this.store) return;
    this.purchasing.set(true);
    try {
      await this.store.restorePurchases();
    } finally {
      this.purchasing.set(false);
    }
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async purchase(productId: string): Promise<void> {
    if (!this.store) {
      console.error('IapService: store not initialized');
      return;
    }

    const offer = this.store.get(productId)?.getOffer();
    if (!offer) {
      console.error(`IapService: no offer found for ${productId}`);
      return;
    }

    this.purchasing.set(true);
    try {
      await this.store.order(offer);
    } catch (err: any) {
      // User-cancelled purchase is not an error
      if (err?.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) {
        return;
      }
      throw err;
    } finally {
      this.purchasing.set(false);
    }
  }

  /**
   * Called when a purchase is approved by the native store.
   * Sends the receipt to the backend for server-side validation.
   */
  private async onApproved(transaction: any): Promise<void> {
    try {
      const platform = transaction.platform === CdvPurchase.Platform.APPLE_APPSTORE ? 'ios' : 'android';
      const receipt = transaction.transactionReceipt ?? transaction.purchaseToken ?? '';
      const productId = transaction.products?.[0]?.id ?? transaction.productId ?? '';

      await firstValueFrom(
        this.http.post(
          `${this.base}/validate-receipt`,
          { platform, receipt, productId },
          { headers: this.headers() },
        ),
      );

      // Verification succeeded — tell the store to finish
      transaction.verify();
    } catch (err) {
      console.error('IapService: receipt validation failed', err);
      // The transaction stays in approved state — will retry on next app open
    }
  }

  /**
   * Called when a transaction is fully finished (acknowledged by both backend and store).
   */
  private onFinished(_transaction: any): void {
    this.purchasing.set(false);
    this.refreshProducts();
  }

  private refreshProducts(): void {
    if (!this.store) return;

    const mapped: IAPProduct[] = [];

    const monthly = this.store.get(PRODUCT_MONTHLY);
    if (monthly) {
      const pricing = monthly.pricing;
      mapped.push({
        id: PRODUCT_MONTHLY,
        title: monthly.title || 'STEPOVR Pro Monthly',
        description: monthly.description || 'Monthly subscription',
        price: pricing?.price || '$3.99',
        priceMicros: pricing?.priceMicros || 3990000,
        currency: pricing?.currency || 'USD',
        type: 'subscription',
      });
    }

    const lifetime = this.store.get(PRODUCT_LIFETIME);
    if (lifetime) {
      const pricing = lifetime.pricing;
      mapped.push({
        id: PRODUCT_LIFETIME,
        title: lifetime.title || 'STEPOVR Pro Lifetime',
        description: lifetime.description || 'One-time purchase',
        price: pricing?.price || '$14.99',
        priceMicros: pricing?.priceMicros || 14990000,
        currency: pricing?.currency || 'USD',
        type: 'non-consumable',
      });
    }

    this.products.set(mapped);
  }
}
