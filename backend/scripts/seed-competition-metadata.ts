#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Seed competition_metadata from the reviewed competition-metadata.json.
 * Idempotent — uses INSERT ... ON CONFLICT DO UPDATE so re-runs are safe
 * and propagate any manual edits.
 *
 * The 7 individual awards (ballon-dor, golden-boot, etc.) are included with
 * entity_type='award' so they remain discoverable for future award-themed
 * modes, but tier is left NULL so they don't pollute tier analytics.
 *
 * Run: npm run pool:seed-competitions
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

const IN_FILE = path.resolve(
  __dirname,
  '_backfill-pool',
  'competition-metadata.json'
);

// Individual-award slugs: reclassify entity_type from "trophy" → "award" on seed
// so downstream queries can filter them out of tier-based analytics cleanly.
const AWARD_SLUGS = new Set([
  'ballon-dor',
  'premier-league-golden-boot',
  'european-golden-shoe',
  'european-golden-boot',
  'pichichi-trophy',
  'torjagerkanone',
  'capocannoniere',
]);

interface InputRecord {
  id: string;
  entity_type: 'league' | 'trophy';
  display_name: string;
  tier: number | null;
  competition_type: string | null;
  country_code: string | null;
  founded_year: number | null;
  defunct_year: number | null;
  warnings?: string[];
}

interface Input {
  records: InputRecord[];
}

async function main(): Promise<void> {
  if (!fs.existsSync(IN_FILE)) {
    console.error(`Missing ${IN_FILE}. Run pool:extract-competitions first.`);
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(IN_FILE, 'utf8')) as Input;

  // Dedupe by id. When the same slug appears as both "league" and "trophy"
  // (e.g. premier-league is extracted as both — the league IS the trophy),
  // prefer the "league" record because the league semantics are stronger.
  const TYPE_PREFERENCE = { league: 0, trophy: 1, award: 2 } as const;
  const byId = new Map<string, InputRecord>();
  let dropped = 0;
  for (const r of src.records) {
    const existing = byId.get(r.id);
    if (!existing) {
      byId.set(r.id, r);
      continue;
    }
    const keepExisting =
      TYPE_PREFERENCE[existing.entity_type] <= TYPE_PREFERENCE[r.entity_type];
    if (!keepExisting) byId.set(r.id, r);
    dropped++;
    console.log(
      `  dedupe: id="${r.id}" — kept ${keepExisting ? existing.entity_type : r.entity_type}, dropped ${keepExisting ? r.entity_type : existing.entity_type}`,
    );
  }

  const rows = Array.from(byId.values()).map((r) => ({
    id: r.id,
    entity_type: AWARD_SLUGS.has(r.id) ? 'award' : r.entity_type,
    display_name: r.display_name,
    tier: AWARD_SLUGS.has(r.id) ? null : r.tier,
    competition_type: r.competition_type,
    country_code: r.country_code,
    founded_year: r.founded_year,
    defunct_year: r.defunct_year,
  }));
  if (dropped > 0) console.log(`  (${dropped} duplicates collapsed)\n`);

  console.log(`Seeding ${rows.length} competitions (leagues + trophies + awards)...`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const supabase = app.get(SupabaseService);

  const { error } = await supabase.client
    .from('competition_metadata')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  // Verify counts.
  const { count } = await supabase.client
    .from('competition_metadata')
    .select('id', { count: 'exact', head: true });

  console.log(`Done. competition_metadata now has ${count ?? '?'} rows.`);
  console.log('\nNext: trigger will auto-populate question_pool.league_tier + competition_type');
  console.log('for any new INSERT or UPDATE that touches competition_id. Existing rows stay unchanged');
  console.log('(already backfilled by the classifier pass).');

  await app.close();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
