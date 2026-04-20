import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type { QuestionCategory } from '../../common/interfaces/question.interface';

/**
 * Reads tag distribution from question_pool. `tags` is a text[] column
 * (populated by the classifier with canonical slugs). We fetch the arrays
 * and flatten client-side — same reasoning as ConceptCoverageService.
 */
@Injectable()
export class EntityScarcityService {
  private readonly logger = new Logger(EntityScarcityService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Returns slug → question count for a category. Every appearance of a slug
   * across all questions counts, so a question tagged with 5 slugs
   * contributes +1 to each.
   */
  async getTagCoverage(category: QuestionCategory): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('tags')
      .eq('category', category)
      .not('tags', 'is', null)
      .limit(50000);

    if (error) {
      this.logger.warn(
        `[getTagCoverage] ${category}: ${error.message} — returning empty coverage`,
      );
      return counts;
    }

    for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
      if (!row.tags) continue;
      for (const slug of row.tags) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }

    return counts;
  }
}
