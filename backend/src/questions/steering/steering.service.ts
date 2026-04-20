import { Injectable, Logger } from '@nestjs/common';
import type { QuestionCategory, Difficulty } from '../../common/interfaces/question.interface';
import { ConceptCoverageService } from './concept-coverage.service';
import { EntityScarcityService } from './entity-scarcity.service';
import { selectConcept } from './concept-selector';
import { selectScarcityTargets } from './scarcity-selector';
import { CATEGORY_ENTITY_TYPES } from './category-entity-types';
import {
  loadCanonicalEntities,
  sanitiseForPrompt,
  type CanonicalEntity,
} from '../classifiers/canonical-entities';

/** Number of target entities to include per batch. */
const TARGET_ENTITY_COUNT = 8;

/** Rolling window of recently-targeted concepts per category. Prevents oscillation. */
const RECENT_CONCEPT_HISTORY = 10;

export interface BatchSteeringPlan {
  /** Chosen concept for this batch, or null if no concept is available. */
  concept: {
    id: string;
    tier: 'singleton' | 'scarce' | 'moderate';
    existingCoverage: number;
    samples: string[];
  } | null;
  /** Canonical entity display names to offer as focus suggestions. */
  entityTargets: string[];
}

/**
 * Orchestrates per-batch steering decisions. Called once by the pool-seed
 * flow before each generateBatch call. Returns a plan that the generator
 * injects into its user prompt as positive steering ("generate about X")
 * instead of the old negative-only "avoid these" approach.
 */
@Injectable()
export class SteeringService {
  private readonly logger = new Logger(SteeringService.name);
  private readonly recentConcepts = new Map<QuestionCategory, string[]>();

  constructor(
    private readonly conceptCoverage: ConceptCoverageService,
    private readonly entityScarcity: EntityScarcityService,
  ) {}

  async planBatch(
    category: QuestionCategory,
    difficulty: Difficulty,
  ): Promise<BatchSteeringPlan> {
    const [coverage, tagCoverage] = await Promise.all([
      this.conceptCoverage.getCoverage(category),
      this.entityScarcity.getTagCoverage(category),
    ]);

    const recentlyTargeted = new Set(this.recentConcepts.get(category) ?? []);
    const chosen = selectConcept({ coverage, difficulty, recentlyTargeted });

    let concept: BatchSteeringPlan['concept'] = null;
    if (chosen) {
      const samples = await this.conceptCoverage.getSampleQuestions(
        category,
        chosen.concept_id,
        2,
      );
      concept = {
        id: chosen.concept_id,
        tier: chosen.tier,
        existingCoverage: chosen.existingCoverage,
        samples,
      };
      this.pushRecent(category, chosen.concept_id);
    }

    const entityTargets = this.pickEntityTargets(category, difficulty, tagCoverage);

    this.logger.debug(
      `[planBatch] ${category}/${difficulty}: concept=${
        concept?.id ?? 'none'
      } (tier=${concept?.tier ?? '-'}, cov=${concept?.existingCoverage ?? '-'}) targets=${entityTargets.length}`,
    );

    return { concept, entityTargets };
  }

  private pickEntityTargets(
    category: QuestionCategory,
    difficulty: Difficulty,
    coverage: Map<string, number>,
  ): string[] {
    const relevantTypes = CATEGORY_ENTITY_TYPES[category];
    if (!relevantTypes || relevantTypes.length === 0) return [];

    let canonical: CanonicalEntity[];
    try {
      const index = loadCanonicalEntities();
      const typeSet = new Set(relevantTypes);
      canonical = index.all.filter((e) => typeSet.has(e.type));
    } catch (err) {
      this.logger.warn(
        `[pickEntityTargets] canonical entities not loadable — skipping entity steering: ${(err as Error).message}`,
      );
      return [];
    }

    const picks = selectScarcityTargets({
      canonical,
      coverage,
      difficulty,
      n: TARGET_ENTITY_COUNT,
    });
    return picks.map((e) => sanitiseForPrompt(e.display_name, 80));
  }

  private pushRecent(category: QuestionCategory, conceptId: string): void {
    const list = this.recentConcepts.get(category) ?? [];
    list.unshift(conceptId);
    if (list.length > RECENT_CONCEPT_HISTORY) list.length = RECENT_CONCEPT_HISTORY;
    this.recentConcepts.set(category, list);
  }
}
