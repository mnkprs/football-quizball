import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AdMob, AdOptions } from '@capacitor-community/admob';
import { ProService } from './pro.service';
import { PosthogService } from './posthog.service';
import { environment } from '../../environments/environment';

export interface AdConfig {
  answerReveal: { everyNthQuestion: number };
  endGame: { enabled: boolean };
  rewardedVideo: { enabled: boolean };
  firstSessionAdsDisabled: boolean;
}

const DEFAULT_AD_CONFIG: AdConfig = {
  answerReveal: { everyNthQuestion: 3 },
  endGame: { enabled: true },
  rewardedVideo: { enabled: false },
  firstSessionAdsDisabled: true,
};

// Google-provided test ad unit IDs — replace with real ones before release
const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';

const FIRST_SESSION_KEY = 'stepovr_first_session_done';

/** Minimum milliseconds between consecutive interstitial impressions. */
const MIN_AD_INTERVAL_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class AdService {
  private pro = inject(ProService);
  private posthog = inject(PosthogService);
  private config = signal<AdConfig>(DEFAULT_AD_CONFIG);
  private questionsSinceLastAd = 0;
  private lastAdShownAt = 0;
  private initialized = false;
  private adLoaded = false;

  private get isFirstSession(): boolean {
    return !localStorage.getItem(FIRST_SESSION_KEY);
  }

  /** Initialize AdMob and preload the first interstitial. Call once at app startup. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!Capacitor.isNativePlatform()) return;

    await AdMob.initialize({ initializeForTesting: !environment.production });
    this.initialized = true;
    await this.preloadInterstitial();
  }

  /** Override the default ad config (e.g. from a remote config endpoint). */
  setConfig(config: AdConfig): void {
    this.config.set(config);
  }

  /**
   * Call after each answer submission.
   * Returns true if an interstitial was shown.
   */
  async onAnswerSubmitted(): Promise<boolean> {
    this.questionsSinceLastAd++;
    const frequency = this.config().answerReveal.everyNthQuestion;
    if (this.questionsSinceLastAd >= frequency) {
      return this.tryShowInterstitial('answer_reveal');
    }
    return false;
  }

  /**
   * Call when a game ends.
   * Returns true if an interstitial was shown.
   */
  async onGameEnd(): Promise<boolean> {
    if (!this.config().endGame.enabled) return false;
    return this.tryShowInterstitial('game_end');
  }

  /** Mark first session as complete — future sessions will show ads. */
  markFirstSessionComplete(): void {
    localStorage.setItem(FIRST_SESSION_KEY, '1');
  }

  /** Reset question counter — call at the start of each new game. */
  resetQuestionCounter(): void {
    this.questionsSinceLastAd = 0;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async tryShowInterstitial(trigger: 'answer_reveal' | 'game_end'): Promise<boolean> {
    if (this.pro.isPro()) return false;
    if (this.config().firstSessionAdsDisabled && this.isFirstSession) return false;
    if (!this.initialized) return false;
    if (Date.now() - this.lastAdShownAt < MIN_AD_INTERVAL_MS) return false;

    try {
      if (!this.adLoaded) {
        await this.preloadInterstitial();
      }
      await AdMob.showInterstitial();
      this.lastAdShownAt = Date.now();
      this.questionsSinceLastAd = 0;
      this.adLoaded = false;
      this.posthog.track('ad_interstitial_shown', { trigger });
      // Fire-and-forget preload for next impression
      void this.preloadInterstitial();
      return true;
    } catch {
      return false;
    }
  }

  private async preloadInterstitial(): Promise<void> {
    if (!this.initialized) return;
    try {
      const isIos = Capacitor.getPlatform() === 'ios';
      const prodId = isIos
        ? environment.admobInterstitialIos
        : environment.admobInterstitialAndroid;

      const adId = environment.production && prodId ? prodId
        : isIos ? TEST_INTERSTITIAL_IOS
        : TEST_INTERSTITIAL_ANDROID;

      const options: AdOptions = { adId };
      await AdMob.prepareInterstitial(options);
      this.adLoaded = true;
    } catch {
      this.adLoaded = false;
    }
  }
}
