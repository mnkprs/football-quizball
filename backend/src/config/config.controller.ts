import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface AdConfig {
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

interface VersionConfig {
  minVersion: string;
  latestVersion: string;
  updateUrl: {
    ios: string;
    android: string;
  };
}

const DEFAULT_VERSION_CONFIG: VersionConfig = {
  minVersion: '0.0.0',
  latestVersion: '0.0.0',
  updateUrl: {
    ios: 'https://apps.apple.com/app/stepovr/id_PLACEHOLDER',
    android: 'https://play.google.com/store/apps/details?id=com.stepovr.app',
  },
};

/**
 * Remote kill-switch and mode-availability flags for shipped native builds.
 * Default = everything enabled. Flip a mode to `false` by upserting
 * `app_settings.feature_flags` to disable it for all clients without requiring
 * a store-review cycle. Partial overrides are deep-merged with defaults.
 */
interface FeatureFlags {
  modes: {
    battleRoyale: boolean;
    duel: boolean;
    solo: boolean;
    blitz: boolean;
    mayhem: boolean;
    logoQuiz: boolean;
    twoPlayer: boolean;
    daily: boolean;
  };
  maintenance: {
    enabled: boolean;
    message: string;
  };
  purchases: {
    enabled: boolean;
  };
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  modes: {
    battleRoyale: true,
    duel: true,
    solo: true,
    blitz: true,
    mayhem: true,
    logoQuiz: true,
    twoPlayer: true,
    daily: true,
  },
  maintenance: {
    enabled: false,
    message: '',
  },
  purchases: {
    enabled: true,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeFeatureFlags(override: unknown): FeatureFlags {
  if (!isPlainObject(override)) return DEFAULT_FEATURE_FLAGS;
  const modes = isPlainObject(override['modes']) ? override['modes'] : {};
  const maintenance = isPlainObject(override['maintenance']) ? override['maintenance'] : {};
  const purchases = isPlainObject(override['purchases']) ? override['purchases'] : {};
  return {
    modes: { ...DEFAULT_FEATURE_FLAGS.modes, ...modes } as FeatureFlags['modes'],
    maintenance: { ...DEFAULT_FEATURE_FLAGS.maintenance, ...maintenance } as FeatureFlags['maintenance'],
    purchases: { ...DEFAULT_FEATURE_FLAGS.purchases, ...purchases } as FeatureFlags['purchases'],
  };
}

@Controller('api/config')
export class ConfigController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('ads')
  async getAdConfig(): Promise<AdConfig> {
    const raw = await this.supabase.getSetting('ad_config');
    if (!raw) return DEFAULT_AD_CONFIG;
    try {
      return { ...DEFAULT_AD_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_AD_CONFIG;
    }
  }

  @Get('version')
  async getVersionConfig(): Promise<VersionConfig> {
    const raw = await this.supabase.getSetting('version_config');
    if (!raw) return DEFAULT_VERSION_CONFIG;
    try {
      return { ...DEFAULT_VERSION_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_VERSION_CONFIG;
    }
  }

  @Get('feature-flags')
  async getFeatureFlags(): Promise<FeatureFlags> {
    const raw = await this.supabase.getSetting('feature_flags');
    if (!raw) return DEFAULT_FEATURE_FLAGS;
    try {
      return mergeFeatureFlags(JSON.parse(raw));
    } catch {
      return DEFAULT_FEATURE_FLAGS;
    }
  }
}
