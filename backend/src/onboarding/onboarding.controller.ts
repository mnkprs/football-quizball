import { Controller, Get } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import type { OnboardingQuestionsResponse } from './onboarding.types';

@Controller('api/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * Returns the first-run onboarding pack: 5 EASY questions, one per category.
   * Same set for every new user — no auth required.
   */
  @Get('questions')
  async getQuestions(): Promise<OnboardingQuestionsResponse> {
    return { questions: await this.onboardingService.getOnboardingQuestions() };
  }
}
