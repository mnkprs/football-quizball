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
}
