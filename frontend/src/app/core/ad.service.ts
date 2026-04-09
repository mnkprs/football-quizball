import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AdMob, AdOptions, RewardAdOptions } from '@capacitor-community/admob';
import { ProService } from './pro.service';
import { AnalyticsService } from './analytics.service';
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

// Google-provided test ad unit IDs — used in dev mode
const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';

const FIRST_SESSION_KEY = 'stepovr_first_session_done';

/** Minimum milliseconds between consecutive interstitial impressions. */
const MIN_AD_INTERVAL_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class AdService {
  private pro = inject(ProService);
  private analytics = inject(AnalyticsService);
  private config = signal<AdConfig>(DEFAULT_AD_CONFIG);
  private questionsSinceLastAd = 0;
  private lastAdShownAt = 0;
  private initialized = false;
  private adLoaded = false;
  private rewardedAdLoaded = false;

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

  /**
   * Show a rewarded video ad. Returns true if the user watched the full ad
   * and earned the reward (50/50, 2x points, etc.).
   * Returns false if the ad couldn't load, user dismissed early, or user is Pro.
   */
  async showRewardedAd(trigger: string): Promise<boolean> {
    if (this.pro.isPro()) return false;
    if (!this.initialized) return false;
    if (!Capacitor.isNativePlatform()) return false;

    try {
      await this.preloadRewardedAd();
      const reward = await AdMob.showRewardVideoAd();
      this.analytics.track('ad_rewarded_shown', { trigger, reward_type: reward.type, reward_amount: reward.amount });
      // Fire-and-forget preload for next use
      void this.preloadRewardedAd();
      return true;
    } catch {
      return false;
    }
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
      this.analytics.track('ad_interstitial_shown', { trigger });
      // Fire-and-forget preload for next impression
      void this.preloadInterstitial();
      return true;
    } catch {
      return false;
    }
  }

  private async preloadRewardedAd(): Promise<void> {
    if (!this.initialized) return;
    try {
      const isIos = Capacitor.getPlatform() === 'ios';
      const prodId = isIos
        ? environment.admobRewardedIos
        : environment.admobRewardedAndroid;

      const adId = environment.production && prodId ? prodId
        : isIos ? TEST_REWARDED_IOS
        : TEST_REWARDED_ANDROID;

      const options: RewardAdOptions = { adId };
      await AdMob.prepareRewardVideoAd(options);
      this.rewardedAdLoaded = true;
    } catch {
      this.rewardedAdLoaded = false;
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
