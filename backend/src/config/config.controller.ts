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
}
