#!/usr/bin/env npx ts-node
/**
 * Diff team names between footy-logos.json and question_pool (LOGO_QUIZ).
 * Run: npx ts-node backend/scripts/check-logo-coverage.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface LogoEntry {
  team_name: string;
  slug: string;
  league: string;
  country: string;
  image_url: string | null;
  real_image_url: string | null;
  hard_image_url: string | null;
  medium_image_url: string | null;
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function main() {
  const jsonPath = path.resolve(__dirname, '../../footy-logos.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
    by_competition: Record<string, LogoEntry[]>;
  };

  const jsonTeams: LogoEntry[] = Object.values(raw.by_competition).flat();
  const jsonByName = new Map<string, LogoEntry>();
  const jsonBySlug = new Map<string, LogoEntry>();
  for (const t of jsonTeams) {
    jsonByName.set(norm(t.team_name), t);
    jsonBySlug.set(t.slug, t);
  }

  console.log(`JSON: ${jsonTeams.length} teams across ${Object.keys(raw.by_competition).length} competitions`);

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Page through all LOGO_QUIZ rows
  const dbAnswers = new Set<string>();
  const dbRawAnswers: string[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from('question_pool')
      .select('question')
      .eq('category', 'LOGO_QUIZ')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const ans = (row as any).question?.correct_answer;
      if (typeof ans === 'string') {
        dbRawAnswers.push(ans);
        dbAnswers.add(norm(ans));
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`DB:   ${dbRawAnswers.length} LOGO_QUIZ rows, ${dbAnswers.size} unique correct_answer values`);

  // Missing in DB (in JSON but not in DB), split by generation status
  const trulyMissing: LogoEntry[] = [];   // has image_url but not in DB — real gap
  const skippedByDesign: LogoEntry[] = []; // null image_url — generation failed
  for (const t of jsonTeams) {
    if (dbAnswers.has(norm(t.team_name))) continue;
    if (t.image_url == null) skippedByDesign.push(t);
    else trulyMissing.push(t);
  }
  const missingInDb = trulyMissing;

  // Extra in DB (in DB but not in JSON by name)
  const jsonNameSet = new Set(jsonTeams.map(t => norm(t.team_name)));
  const extraInDb: string[] = [];
  for (const a of dbAnswers) {
    if (!jsonNameSet.has(a)) extraInDb.push(a);
  }

  console.log(`\n=== SKIPPED BY DESIGN (null image_url, generation failed): ${skippedByDesign.length} ===`);
  console.log('  (these are expected — not a gap)');

  console.log(`\n=== TRULY MISSING IN DB (image_url present but not seeded): ${missingInDb.length} ===`);
  const byLeague = new Map<string, LogoEntry[]>();
  for (const t of missingInDb) {
    const arr = byLeague.get(t.league) ?? [];
    arr.push(t);
    byLeague.set(t.league, arr);
  }
  for (const [league, teams] of [...byLeague.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  [${league}] — ${teams.length}`);
    for (const t of teams) console.log(`    - ${t.team_name} (${t.slug})`);
  }

  console.log(`\n=== EXTRA IN DB (correct_answer not matching any JSON team_name): ${extraInDb.length} ===`);
  for (const a of extraInDb.slice(0, 100).sort()) console.log(`  - ${a}`);
  if (extraInDb.length > 100) console.log(`  ... and ${extraInDb.length - 100} more`);

  console.log(`\n=== SUMMARY ===`);
  console.log(`  JSON unique names:    ${jsonNameSet.size}`);
  console.log(`  DB unique answers:    ${dbAnswers.size}`);
  console.log(`  Skipped by design:    ${skippedByDesign.length}  (null image_url — generation failed)`);
  console.log(`  Truly missing in DB:  ${missingInDb.length}  (image_url present, but not seeded)`);
  console.log(`  Extra in DB:          ${extraInDb.length}`);
  console.log(`  Matched:              ${jsonNameSet.size - missingInDb.length - skippedByDesign.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
