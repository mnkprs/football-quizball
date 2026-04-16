import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import {
  CanonicalIndex,
  EntityType,
  formatCanonicalListForPrompt,
  isKnownSlug,
} from './canonical-entities';

/**
 * Classifies an existing pool question into structured taxonomy fields that
 * match the new question_pool columns (subject_type/id, competition_id,
 * question_style, mode_compatibility, concept_id, popularity_score, etc.).
 *
 * The canonical entity list is embedded in the system prompt so Gemini can
 * only pick slugs that already exist. Anything that drifts is rejected
 * post-call and the question is flagged for review.
 */

export type QuestionStyle =
  | 'trivia'
  | 'year'
  | 'top5'
  | 'multiple-choice'
  | 'true-false'
  | 'higher-or-lower'
  | 'guess-score'
  | 'player-id';

export type GameMode =
  | 'solo'
  | 'duel'
  | 'blitz'
  | 'battle_royale'
  | 'mayhem'
  | 'hardcore'
  | 'logo_quiz';

export interface ClassifierInput {
  id: string;
  category: string;
  difficulty?: string;
  question_text: string;
  correct_answer: string;
  explanation?: string;
}

export interface ClassifierOutput {
  subject_type: EntityType | null;
  subject_id: string | null;
  subject_name: string | null;
  competition_id: string | null;
  question_style: QuestionStyle | null;
  answer_type: string | null;
  mode_compatibility: GameMode[];
  concept_id: string | null;
  popularity_score: number | null;
  time_sensitive: boolean;
  valid_until: string | null;
  tags: string[];
  // event_year is classifier-sourced; era is a generated column (event_year);
  // league_tier and competition_type are filled by a trigger from competition_metadata.
  event_year: number | null;
}

export interface ClassifierResult {
  question_id: string;
  classification: ClassifierOutput;
  warnings: string[];
  raw_subject_slug?: string;
  raw_competition_slug?: string;
}

const ALLOWED_STYLES: readonly QuestionStyle[] = [
  'trivia',
  'year',
  'top5',
  'multiple-choice',
  'true-false',
  'higher-or-lower',
  'guess-score',
  'player-id',
];

const ALLOWED_MODES: readonly GameMode[] = [
  'solo',
  'duel',
  'blitz',
  'battle_royale',
  'mayhem',
  'hardcore',
  'logo_quiz',
];

const ALLOWED_TYPES: readonly EntityType[] = [
  'player',
  'team',
  'league',
  'trophy',
  'manager',
  'stadium',
  'country',
];

const ALLOWED_ANSWER_TYPES: readonly string[] = [
  'string',
  'year',
  'number',
  'team_name',
  'player_name',
  'country',
  'score',
  'boolean',
  'list',
];

// concept_id must be kebab-case, no leading/trailing hyphen, <=80 chars.
const CONCEPT_ID_PATTERN = /^[a-z][a-z0-9-]{0,78}[a-z0-9]$/;


@Injectable()
export class QuestionClassifierService {
  private readonly logger = new Logger(QuestionClassifierService.name);

  constructor(private readonly llm: LlmService) {}

  async classify(
    input: ClassifierInput,
    canonical: CanonicalIndex
  ): Promise<ClassifierResult> {
    const systemPrompt = this.buildSystemPrompt(canonical);
    const userPrompt = this.buildUserPrompt(input);

    type Raw = {
      subject_type: string | null;
      subject_id: string | null;
      subject_name: string | null;
      competition_id: string | null;
      question_style: string | null;
      answer_type: string | null;
      mode_compatibility: string[] | null;
      concept_id: string | null;
      popularity_score: number | null;
      time_sensitive: boolean | null;
      valid_until: string | null;
      tags: string[] | null;
      event_year: number | null;
    };

    const raw = await this.llm.generateStructuredJson<Raw>(
      systemPrompt,
      userPrompt,
      3
    );

    return this.validate(input.id, raw, canonical);
  }

  private validateAnswerType(raw: unknown, warnings: string[]): string | null {
    if (typeof raw !== 'string' || !raw) return null;
    if (ALLOWED_ANSWER_TYPES.includes(raw)) return raw;
    warnings.push(`invalid answer_type "${raw}" — nulled`);
    return null;
  }

  private validateConceptId(raw: unknown, warnings: string[]): string | null {
    if (typeof raw !== 'string' || !raw) return null;
    if (CONCEPT_ID_PATTERN.test(raw)) return raw;
    warnings.push(`invalid concept_id "${raw}" — nulled`);
    return null;
  }

  private buildSystemPrompt(canonical: CanonicalIndex): string {
    const listBlock = formatCanonicalListForPrompt(canonical);
    return `You classify an existing football (soccer) trivia question into structured taxonomy fields for a question pool. You DO NOT verify facts or rewrite content. You only infer categorical tags from what the question says.

Return JSON with exactly these keys:
  subject_type:        one of ["player","team","league","trophy","manager","stadium","country"] — the PRIMARY real-world entity the question is about, or null if none.
  subject_id:          canonical slug of that primary entity. MUST come from the CANONICAL LIST below, matching the chosen subject_type. If no good match, return null.
  subject_name:        display name of the subject (copy from the list), or null.
  competition_id:      canonical slug of the specific competition scoping the question — either a LEAGUE slug (e.g. "premier-league", "serie-a") OR a TROPHY slug (e.g. "uefa-champions-league", "fifa-world-cup", "europa-league", "copa-del-rey"). null if the question is not scoped to a specific competition.
  question_style:      one of ["trivia","year","top5","multiple-choice","true-false","higher-or-lower","guess-score","player-id"] — the SHAPE of the question, not its content. Infer from phrasing: "How many", "In what year", "Name the top 5", "Higher or lower than X", "Guess the score", "Identify this player".
  answer_type:         short label for the answer's data type: "string", "year", "number", "team_name", "player_name", "country", "score", "boolean", "list".
  mode_compatibility:  OPTIONAL array of modes this question is safe for, subset of ["solo","duel","blitz","battle_royale","mayhem","hardcore","logo_quiz"]. Return [] if you're not confident — this field is optional and empty is fine. Only populate modes you're sure the question works in. Exclude "blitz" for long-text questions. Exclude "logo_quiz" for anything that isn't a logo-identification question.
  concept_id:          short kebab-case slug describing the UNDERLYING concept being tested, e.g. "world-cup-winners", "ballon-dor-history", "premier-league-top-scorers", "uefa-treble-teams", "club-stadium-matchups", "manager-trophy-history". Aim for broad reusable concepts, not question-specific. null if no clean concept applies.
  popularity_score:    integer 1..100 measuring the FAME of the subject (not the difficulty of the question). Messi/Ronaldo = 95-100. Premier League = 95. A 1990s Greek Super League player = 10-25. Return null only if subject_type is null.
  time_sensitive:      true if the correct answer can change over time (current manager of a club, top scorer of an active season, current league leader). false for historical facts.
  valid_until:         ISO date "YYYY-MM-DD" if time_sensitive and you can estimate expiry. null otherwise.
  tags:                array of other canonical slugs from the list that are MENTIONED in the question (secondary references). Up to 6. Empty array if none.
  event_year:          integer 1850..current year. The primary year the question references (year of the match, trophy win, transfer, record, etc.). Null if the question is not year-anchored. (league_tier, competition_type, and era are NOT your responsibility — league_tier + competition_type are filled from a metadata table based on competition_id, and era is derived from event_year.)

STRICT RULES:
- subject_id, competition_id, and every tag MUST appear verbatim in the CANONICAL LIST below. If the entity you'd pick is not in the list, return null for that field (not a made-up slug). This is critical — slug drift breaks the pool.
- For COUNTRY slugs (both in subject_id when type="country" and in tags), always use the ISO alpha-2 code as listed ("no" for Norway, "gr" for Greece, "cz" for Czech Republic, "at" for Austria). NEVER use the country name as a slug. The list shows "no | Norway" — you output "no".
- competition_id accepts a league slug OR a trophy slug (both types are valid — whichever specific competition the question is scoped to).
- Do not invent slugs of any kind.
- Do not hallucinate entities that are not named in the question.
- Prefer a single strong primary subject over a weaker one. If the question asks "which club did X play for", the subject is the PLAYER (that's the anchor), and the answer/team goes into tags.
- For a "top 5" or "name N" style question, subject_type is the TROPHY / LEAGUE the ranking is about. All listed teams/players go into tags.

CANONICAL LIST (pick subject_id, competition_id, and tags ONLY from here):
${listBlock}`;
  }

  private buildUserPrompt(q: ClassifierInput): string {
    return `Classify this question:

ID: ${q.id}
Category: ${q.category}${q.difficulty ? `\nDifficulty: ${q.difficulty}` : ''}
Question: ${q.question_text}
Correct answer: ${q.correct_answer}${q.explanation ? `\nExplanation: ${q.explanation}` : ''}

Return JSON with the exact keys defined in the system prompt. No extra keys.`;
  }

  private validate(
    id: string,
    raw: {
      subject_type: string | null;
      subject_id: string | null;
      subject_name: string | null;
      competition_id: string | null;
      question_style: string | null;
      answer_type: string | null;
      mode_compatibility: string[] | null;
      concept_id: string | null;
      popularity_score: number | null;
      time_sensitive: boolean | null;
      valid_until: string | null;
      tags: string[] | null;
      event_year: number | null;
    },
    canonical: CanonicalIndex
  ): ClassifierResult {
    const warnings: string[] = [];
    const rawSubjectSlug = raw.subject_id ?? undefined;
    const rawCompetitionSlug = raw.competition_id ?? undefined;

    // subject_type
    let subjectType: EntityType | null = null;
    if (raw.subject_type && ALLOWED_TYPES.includes(raw.subject_type as EntityType)) {
      subjectType = raw.subject_type as EntityType;
    } else if (raw.subject_type) {
      warnings.push(`invalid subject_type "${raw.subject_type}" — nulled`);
    }

    // subject_id — must be canonical
    let subjectId: string | null = null;
    if (subjectType && raw.subject_id) {
      if (isKnownSlug(canonical, subjectType, raw.subject_id)) {
        subjectId = raw.subject_id;
      } else {
        warnings.push(
          `unknown subject_id "${raw.subject_id}" for type "${subjectType}" — nulled`
        );
      }
    }
    // competition_id — must be canonical league OR trophy
    let competitionId: string | null = null;
    if (raw.competition_id) {
      if (
        isKnownSlug(canonical, 'league', raw.competition_id) ||
        isKnownSlug(canonical, 'trophy', raw.competition_id)
      ) {
        competitionId = raw.competition_id;
      } else {
        warnings.push(`unknown competition_id "${raw.competition_id}" — nulled`);
      }
    }

    // question_style
    const style =
      raw.question_style && ALLOWED_STYLES.includes(raw.question_style as QuestionStyle)
        ? (raw.question_style as QuestionStyle)
        : null;
    if (raw.question_style && !style) {
      warnings.push(`invalid question_style "${raw.question_style}" — nulled`);
    }

    // mode_compatibility
    const modes: GameMode[] = [];
    for (const m of raw.mode_compatibility ?? []) {
      if (ALLOWED_MODES.includes(m as GameMode)) modes.push(m as GameMode);
      else warnings.push(`dropped invalid mode "${m}"`);
    }

    // popularity_score
    let popularity: number | null = null;
    if (typeof raw.popularity_score === 'number') {
      const v = Math.round(raw.popularity_score);
      if (v >= 1 && v <= 100) popularity = v;
      else warnings.push(`popularity_score out of range (${raw.popularity_score}) — nulled`);
    }

    // valid_until
    let validUntil: string | null = null;
    if (raw.valid_until) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw.valid_until)) validUntil = raw.valid_until;
      else warnings.push(`invalid valid_until "${raw.valid_until}" — nulled`);
    }

    // event_year — plausible range. era is derived DB-side (generated column);
    // league_tier + competition_type are filled by the sync trigger.
    let eventYear: number | null = null;
    if (typeof raw.event_year === 'number') {
      const v = Math.round(raw.event_year);
      const now = new Date().getUTCFullYear();
      if (v >= 1850 && v <= now + 1) eventYear = v;
      else warnings.push(`event_year out of range (${raw.event_year}) — nulled`);
    }

    // tags — keep only canonical slugs (any type)
    const tags: string[] = [];
    for (const t of raw.tags ?? []) {
      if (typeof t !== 'string' || !t) continue;
      const known = ALLOWED_TYPES.some((type) => isKnownSlug(canonical, type, t));
      if (known) tags.push(t);
      else warnings.push(`dropped unknown tag "${t}"`);
    }

    return {
      question_id: id,
      classification: {
        subject_type: subjectId ? subjectType : null,
        subject_id: subjectId,
        subject_name: subjectId
          ? canonical.bySlug.get(`${subjectType}::${subjectId}`)?.display_name ?? null
          : null,
        competition_id: competitionId,
        question_style: style,
        answer_type: this.validateAnswerType(raw.answer_type, warnings),
        mode_compatibility: modes,
        concept_id: this.validateConceptId(raw.concept_id, warnings),
        popularity_score: popularity,
        time_sensitive: Boolean(raw.time_sensitive),
        valid_until: validUntil,
        tags,
        event_year: eventYear,
      },
      warnings,
      raw_subject_slug: rawSubjectSlug,
      raw_competition_slug: rawCompetitionSlug,
    };
  }
}
