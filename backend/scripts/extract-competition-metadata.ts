#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Build the competition_metadata source of truth from the reviewed canonical
 * entity list. For every entity of type "league" or "trophy" we ask Gemini
 * (with web search grounding) for the structured facts that powered the
 * denormalised question_pool columns: prestige tier, competition type,
 * country, founded/defunct years.
 *
 * Output is a reviewable JSON file you eyeball + hand-edit, then a separate
 * migration seeds competition_metadata from it.
 *
 * Run:  npm run pool:extract-competitions
 * Output: backend/scripts/_backfill-pool/competition-metadata.json
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { LlmService } from '../src/llm/llm.service';
import {
  CanonicalEntity,
  loadCanonicalEntities,
} from '../src/questions/classifiers/canonical-entities';

const OUT_DIR = path.resolve(__dirname, '_backfill-pool');
const OUT_FILE = path.join(OUT_DIR, 'competition-metadata.json');

const ALLOWED_COMPETITION_TYPES = [
  'domestic_league',
  'domestic_cup',
  'continental_club',
  'international_national',
  'youth',
  'friendly',
  'other',
] as const;

type CompetitionType = (typeof ALLOWED_COMPETITION_TYPES)[number];

interface CompetitionMetadata {
  id: string;
  entity_type: 'league' | 'trophy';
  display_name: string;
  tier: number | null;
  competition_type: CompetitionType | null;
  country_code: string | null;
  founded_year: number | null;
  defunct_year: number | null;
  warnings: string[];
}

interface GeminiBatchOutput {
  competitions: Array<{
    id: string;
    tier: number | null;
    competition_type: string | null;
    country_code: string | null;
    founded_year: number | null;
    defunct_year: number | null;
  }>;
}

function parseArgs(): { batchSize: number; concurrency: number } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    batchSize: Number(get('--batch-size') ?? 20),
    concurrency: Number(get('--concurrency') ?? 2),
  };
}

const SYSTEM_PROMPT = `You are a football (soccer) competition reference. Given a batch of league/trophy canonical slugs with display names, return authoritative structured facts for each.

For each competition return:
- id: the exact slug from input (do not invent, do not reformat)
- tier: integer 1..5 describing prestige
    1 = top-5 EU domestic leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1) OR the top-tier continental club trophy (UEFA Champions League) OR the global national-team trophy (FIFA World Cup)
    2 = other major European top flights (Eredivisie, Primeira Liga, Süper Lig, etc.) OR secondary continental club trophy (UEFA Europa League, UEFA Cup Winners' Cup) OR top continental national-team trophy (UEFA Euro, Copa America)
    3 = other notable professional leagues (MLS, Saudi Pro League, J1 League, Scottish Premiership, Russian Premier League, etc.) OR tertiary continental (UEFA Conference League) OR other regional national-team trophies
    4 = lower national divisions (Championship, Serie B, Segunda División, etc.)
    5 = youth / amateur / defunct minor / friendlies
    Return null if genuinely unclassifiable.
- competition_type: one of ["domestic_league","domestic_cup","continental_club","international_national","youth","friendly","other"]
    domestic_league = national top flight or lower division
    domestic_cup = national knockout cup (FA Cup, Copa del Rey, DFB-Pokal, Coppa Italia)
    continental_club = UEFA / CONMEBOL / AFC / CAF club competition (Champions League, Europa League, Copa Libertadores)
    international_national = national-team tournament (World Cup, Euro, Copa America, AFCON, Gold Cup)
    youth = under-21 / U-17 etc.
    friendly = non-competitive (Trophée des Champions is technically a super cup — use "other")
    other = anything else (super cups, testimonial, etc.)
- country_code: ISO alpha-2 lowercase code for the HOST country of a domestic competition (e.g. "gb" for Premier League, "es" for La Liga, "gr" for Greek Super League). NULL for continental or international competitions (UEFA Champions League, FIFA World Cup — no single host country).
- founded_year: integer 1850..current_year. Year the competition was founded / first edition. NULL if unknown.
- defunct_year: integer, ONLY if the competition no longer exists (e.g. UEFA Cup Winners' Cup ended 1999, European Cup rebranded to UEFA Champions League in 1992 — use 1992 for "european-cup"). NULL for still-active competitions.

Return JSON: { "competitions": [ {id, tier, competition_type, country_code, founded_year, defunct_year}, ... ] }

Rules:
- Return one record per input slug, preserving the slug verbatim.
- For trophies that are the same competition rebranded (European Cup ↔ UEFA Champions League, UEFA Cup ↔ Europa League), treat as distinct and set defunct_year on the older slug.
- Do NOT invent data. If uncertain on founded_year, return null rather than guess.`;

async function extractBatch(
  llm: LlmService,
  batch: CanonicalEntity[]
): Promise<GeminiBatchOutput> {
  const items = batch
    .map((e, i) => `[${i + 1}] id="${e.slug}" type="${e.type}" display_name="${e.display_name}"`)
    .join('\n');
  const userPrompt = `Return structured metadata for these ${batch.length} competitions:\n\n${items}\n\nReturn JSON exactly as specified.`;
  return llm.generateStructuredJsonWithWebSearch<GeminiBatchOutput>(
    SYSTEM_PROMPT,
    userPrompt,
    { maxRetries: 3 }
  );
}

function validateRecord(
  input: CanonicalEntity,
  raw: GeminiBatchOutput['competitions'][number] | undefined
): CompetitionMetadata {
  const warnings: string[] = [];
  if (!raw) {
    warnings.push('Gemini returned no record for this slug');
    return {
      id: input.slug,
      entity_type: input.type as 'league' | 'trophy',
      display_name: input.display_name,
      tier: null,
      competition_type: null,
      country_code: null,
      founded_year: null,
      defunct_year: null,
      warnings,
    };
  }

  let tier: number | null = null;
  if (typeof raw.tier === 'number') {
    const v = Math.round(raw.tier);
    if (v >= 1 && v <= 5) tier = v;
    else warnings.push(`tier out of range: ${raw.tier}`);
  }

  let competitionType: CompetitionType | null = null;
  if (raw.competition_type) {
    if ((ALLOWED_COMPETITION_TYPES as readonly string[]).includes(raw.competition_type)) {
      competitionType = raw.competition_type as CompetitionType;
    } else {
      warnings.push(`invalid competition_type: ${raw.competition_type}`);
    }
  }

  let countryCode: string | null = null;
  if (raw.country_code && /^[a-z]{2}$/.test(raw.country_code)) {
    countryCode = raw.country_code;
  } else if (raw.country_code) {
    warnings.push(`invalid country_code: ${raw.country_code}`);
  }

  const now = new Date().getUTCFullYear();
  let foundedYear: number | null = null;
  if (typeof raw.founded_year === 'number') {
    const v = Math.round(raw.founded_year);
    if (v >= 1850 && v <= now) foundedYear = v;
    else warnings.push(`founded_year out of range: ${raw.founded_year}`);
  }

  let defunctYear: number | null = null;
  if (typeof raw.defunct_year === 'number') {
    const v = Math.round(raw.defunct_year);
    if (v >= 1850 && v <= now) defunctYear = v;
    else warnings.push(`defunct_year out of range: ${raw.defunct_year}`);
  }

  return {
    id: input.slug,
    entity_type: input.type as 'league' | 'trophy',
    display_name: input.display_name,
    tier,
    competition_type: competitionType,
    country_code: countryCode,
    founded_year: foundedYear,
    defunct_year: defunctYear,
    warnings,
  };
}

async function runBatched<T, R>(
  items: T[],
  batchSize: number,
  concurrency: number,
  fn: (batch: T[], idx: number) => Promise<R>
): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
  const results: R[] = new Array(batches.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= batches.length) return;
      try {
        results[idx] = await fn(batches[idx], idx);
        console.log(`  batch ${idx + 1}/${batches.length} done (${batches[idx].length} competitions)`);
      } catch (err) {
        console.error(`  batch ${idx + 1} failed:`, (err as Error).message);
        results[idx] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const { batchSize, concurrency } = parseArgs();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const llm = app.get(LlmService);

  const canonical = loadCanonicalEntities();
  const competitions = canonical.all.filter(
    (e) => e.type === 'league' || e.type === 'trophy'
  );
  console.log(
    `Extracting metadata for ${competitions.length} competitions (${canonical.byType.get('league')?.length ?? 0} leagues + ${canonical.byType.get('trophy')?.length ?? 0} trophies).`
  );

  const batchResults = await runBatched(competitions, batchSize, concurrency, (batch) =>
    extractBatch(llm, batch)
  );

  // Flatten all Gemini outputs into a single id -> raw record map.
  const rawById = new Map<string, GeminiBatchOutput['competitions'][number]>();
  for (const out of batchResults) {
    if (!out) continue;
    for (const c of out.competitions ?? []) {
      if (c && typeof c.id === 'string') rawById.set(c.id, c);
    }
  }

  // Merge each canonical competition with its Gemini record, preserving order.
  const records = competitions.map((e) => validateRecord(e, rawById.get(e.slug)));

  const warnCount = records.filter((r) => r.warnings.length > 0).length;
  const summary = {
    generated_at: new Date().toISOString(),
    total: records.length,
    warnings: warnCount,
    counts_by_entity_type: {
      league: records.filter((r) => r.entity_type === 'league').length,
      trophy: records.filter((r) => r.entity_type === 'trophy').length,
    },
    counts_by_tier: [1, 2, 3, 4, 5].map((t) => ({
      tier: t,
      count: records.filter((r) => r.tier === t).length,
    })),
    records,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\nWritten: ${OUT_FILE}`);
  console.log(`  ${records.length} competitions · ${warnCount} with warnings`);
  console.log('\nReview the JSON, fix any wrong tiers/types, then seed competition_metadata from it.');

  await app.close();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
