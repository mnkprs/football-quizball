import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { OnboardingCategory, OnboardingQuestion } from './onboarding.types';

/** Order is fixed — drives the first-impression narrative: visual hook → binary → warm-up → history → finisher. */
const ONBOARDING_CATEGORIES: OnboardingCategory[] = [
  'LOGO_QUIZ',
  'HIGHER_OR_LOWER',
  'GEOGRAPHY',
  'HISTORY',
  'PLAYER_ID',
];

/**
 * Pool of candidates to randomize from per category.
 * Also used as the donor pool for cross-question distractors when `wrong_choices`
 * is empty on the picked row (common for LOGO_QUIZ / PLAYER_ID since real gameplay
 * uses text input, not multiple choice).
 */
const CANDIDATES_PER_CATEGORY = 40;

interface PoolRow {
  image_url?: string | null;
  answer_type?: string | null;
  question: {
    id?: string;
    question_text?: string;
    correct_answer?: string;
    wrong_choices?: string[];
    explanation?: string;
    meta?: { original_image_url?: string } & Record<string, unknown>;
  };
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Returns the 5-question onboarding pack, one question per category, EASY difficulty.
   * Live draw from `question_pool` — read-only SELECT, does not consume pool slots.
   * If a category is empty or cannot produce a valid MC question, it is skipped.
   */
  async getOnboardingQuestions(): Promise<OnboardingQuestion[]> {
    const drawn = await Promise.all(
      ONBOARDING_CATEGORIES.map((cat) => this.drawOne(cat)),
    );

    const questions = drawn.filter((q): q is OnboardingQuestion => q !== null);

    if (questions.length < ONBOARDING_CATEGORIES.length) {
      const missing = ONBOARDING_CATEGORIES.filter((_, i) => drawn[i] === null);
      this.logger.warn(`[onboarding] No valid EASY questions found for: ${missing.join(', ')}`);
    }

    return questions;
  }

  private async drawOne(category: OnboardingCategory): Promise<OnboardingQuestion | null> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('question, image_url, answer_type')
      .eq('category', category)
      .eq('difficulty', 'EASY')
      .limit(CANDIDATES_PER_CATEGORY);

    if (error) {
      this.logger.error(`[onboarding] Draw failed for ${category}: ${error.message}`);
      return null;
    }

    const rows = ((data ?? []) as PoolRow[])
      .filter((r) => !!r.question?.question_text && !!r.question?.correct_answer);

    if (rows.length === 0) return null;

    // For HIGHER_OR_LOWER, distractors are question-specific (e.g. "Messi or Ronaldo"),
    // so cross-question fallback doesn't make sense — require a row that already has
    // at least one wrong_choice. Everything else can borrow correct_answers from
    // sibling rows as distractors (team names, player names, cities, years).
    const candidates = category === 'HIGHER_OR_LOWER'
      ? rows.filter((r) => (r.question.wrong_choices ?? []).length >= 1)
      : rows;

    if (candidates.length === 0) return null;

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    // Only use sibling rows with the same answer_type as distractors so city
    // questions get city options, country questions get country options, etc.
    const pickedType = picked.answer_type;
    const donorPool = rows
      .filter((r) =>
        r.question.correct_answer !== picked.question.correct_answer &&
        (!pickedType || r.answer_type === pickedType),
      )
      .map((r) => r.question.correct_answer!)
      .filter(Boolean);

    return this.buildQuestion(category, picked, donorPool);
  }

  private buildQuestion(
    category: OnboardingCategory,
    row: PoolRow,
    donorPool: string[],
  ): OnboardingQuestion | null {
    const q = row.question;
    const prompt = q.question_text?.trim();
    const correct = q.correct_answer?.trim();
    if (!prompt || !correct) return null;

    const targetChoiceCount = category === 'HIGHER_OR_LOWER' ? 2 : 3;
    const choices = this.assembleChoices(correct, q.wrong_choices ?? [], donorPool, targetChoiceCount);

    // Safety net — don't ship a <2-choice MC question.
    if (choices.length < 2) return null;

    const isLogo = category === 'LOGO_QUIZ';
    const topLevelImageUrl = row.image_url ?? undefined;
    return {
      category,
      prompt,
      image_url: isLogo ? topLevelImageUrl : undefined,
      original_image_url: isLogo ? q.meta?.original_image_url ?? topLevelImageUrl : undefined,
      choices: this.shuffle(choices),
      correct_answer: correct,
      explanation: q.explanation?.trim() ?? '',
    };
  }

  /**
   * Assembles `target` choices: correct + embedded wrong_choices, then top up from
   * the donor pool (other candidates' correct_answers) until full. Case-insensitive
   * dedupe prevents "Real Madrid" vs "real madrid" showing as two options.
   */
  private assembleChoices(
    correct: string,
    embeddedWrongs: string[],
    donorPool: string[],
    target: number,
  ): string[] {
    const seen = new Set<string>([correct.toLowerCase()]);
    const out: string[] = [correct];

    const tryAdd = (candidate: string | undefined | null) => {
      if (!candidate) return;
      const trimmed = candidate.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };

    for (const w of embeddedWrongs) {
      if (out.length >= target) break;
      tryAdd(w);
    }

    if (out.length < target) {
      for (const donor of this.shuffle(donorPool)) {
        if (out.length >= target) break;
        tryAdd(donor);
      }
    }

    return out;
  }

  private shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
