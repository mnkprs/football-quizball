import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type { QuestionCategory } from '../../common/interfaces/question.interface';
import type { ConceptCoverage } from './concept-selector';

/**
 * Reads concept_id distribution from question_pool. Aggregates client-side
 * because PostgREST doesn't expose GROUP BY directly and the pool is small
 * enough (<10k rows per category) that fetching the column and counting in
 * JS is cheaper than adding a dedicated RPC + migration.
 */
@Injectable()
export class ConceptCoverageService {
  private readonly logger = new Logger(ConceptCoverageService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Returns concept_id → question count for a category. Drops null concept_ids
   * (produced by classifier misses — tracked separately via a backfill script).
   */
  async getCoverage(category: QuestionCategory): Promise<ConceptCoverage[]> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('concept_id')
      .eq('category', category)
      .not('concept_id', 'is', null)
      .limit(50000);

    if (error) {
      this.logger.warn(
        `[getCoverage] ${category}: ${error.message} — returning empty coverage`,
      );
      return [];
    }

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ concept_id: string }>) {
      counts.set(row.concept_id, (counts.get(row.concept_id) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([concept_id, count]) => ({
      concept_id,
      count,
    }));
  }

  /**
   * Returns up to `limit` sample question texts for a given concept_id. Used
   * to give the LLM a concrete example of the concept shape so it generates
   * variations rather than inventing a new interpretation of the slug.
   */
  async getSampleQuestions(
    category: QuestionCategory,
    conceptId: string,
    limit = 2,
  ): Promise<string[]> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('question->question_text')
      .eq('category', category)
      .eq('concept_id', conceptId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      this.logger.debug(
        `[getSampleQuestions] ${category}/${conceptId}: no samples available`,
      );
      return [];
    }

    return (data as Array<{ question_text: string }>)
      .map((r) => r.question_text)
      .filter(Boolean);
  }
}
