/**
 * Re-seed Logo Quiz questions with difficulty based on team POPULARITY,
 * not erasure level. All questions show the easy-erased image.
 *
 * Tiers:
 *   EASY   = World-famous teams (top 5 leagues, CL, iconic national teams)
 *   MEDIUM = Moderately known (mid-tier European, strong non-European)
 *   HARD   = Obscure (lower divisions, small leagues, unknown nations)
 *
 * Usage: npx ts-node scripts/reseed-logo-by-popularity.ts [--dry-run]
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOGOS_JSON = path.join(__dirname, '..', '..', 'footy-logos.json');

// ─── Popularity tiers by competition ──────────────────────────
// EASY: Everyone knows these teams
const TIER_EASY: string[] = [
  'premier-league',
  'laliga',
  'serie-a',
  'bundesliga',
  'ligue-1',
  'uefa-champions-league',
  'fifa-world-cup-2026',
  'fifa-world-cup-editions',
];

// MEDIUM: Football fans know these
const TIER_MEDIUM: string[] = [
  'eredivisie',
  'liga-portugal',
  'super-lig',
  'scottish-premiership',
  'belgian-pro-league',
  'swiss-super-league',
  'austrian-bundesliga',
  'superliga-denmark',
  'russian-premier-league',
  'ukrainian-premier-league',
  'super-league-greece',
  'efl-championship',
  'europa-league',
  'brasileirao-serie-a',
  'liga-mx',
  'mls',
  'copa-libertadores',
  'saudi-pro-league',
  'world-cup-2026-qualifiers',
  'ekstraklasa',
  'supersport-hnl',
  'laliga-2',
  'bundesliga-2',
  'serie-b',
  'ligue-2',
  'k-league-1',
];

// HARD: Everything else (lower divisions, obscure leagues, small nations)
// Any competition not in EASY or MEDIUM is automatically HARD

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

function getPopularityDifficulty(competition: string): Difficulty {
  if (TIER_EASY.includes(competition)) return 'EASY';
  if (TIER_MEDIUM.includes(competition)) return 'MEDIUM';
  return 'HARD';
}

const POINTS: Record<Difficulty, number> = { EASY: 10, MEDIUM: 20, HARD: 30 };

interface TeamLogo {
  team_name: string;
  slug: string;
  real_image_url: string;
  image_url?: string | null;
  medium_image_url?: string | null;
  hard_image_url?: string | null;
  league?: string;
  country?: string;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Reseed Logo Quiz by Popularity (dry-run: ${dryRun})`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const data = JSON.parse(fs.readFileSync(LOGOS_JSON, 'utf-8'));

  // Step 1: Delete ALL existing LOGO_QUIZ questions
  if (!dryRun) {
    console.log('  Deleting all existing LOGO_QUIZ questions...');
    let totalDeleted = 0;
    // Delete in batches (Supabase has row limits)
    while (true) {
      const { data: batch, error } = await supabase
        .from('question_pool')
        .delete()
        .eq('category', 'LOGO_QUIZ')
        .limit(500)
        .select('id');
      if (error) {
        console.error('  Delete error:', error.message);
        break;
      }
      if (!batch || batch.length === 0) break;
      totalDeleted += batch.length;
    }
    console.log(`  Deleted: ${totalDeleted} old questions`);
  }

  // Step 2: Build new questions — ONE per team (not 3), difficulty = popularity
  // All show the easy-erased image
  // Dedup: if same team appears in multiple competitions, keep the easier
  // (more popular) version so users see the best-known variant first.
  const rows: any[] = [];
  const seenSlugs = new Map<string, { difficulty: Difficulty; index: number }>();
  const stats = { EASY: 0, MEDIUM: 0, HARD: 0, skipped: 0, deduped: 0 };

  const DIFF_RANK: Record<Difficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

  for (const [comp, teams] of Object.entries(data.by_competition)) {
    const difficulty = getPopularityDifficulty(comp);

    for (const team of teams as TeamLogo[]) {
      // Must have an easy erasure image
      const imageUrl = team.image_url;
      if (!imageUrl || !imageUrl.includes('supabase.co')) {
        stats.skipped++;
        continue;
      }

      // Dedup by slug — if already seen, keep the easier (more popular) version
      const existing = seenSlugs.get(team.slug);
      if (existing) {
        if (DIFF_RANK[difficulty] < DIFF_RANK[existing.difficulty]) {
          // This version is from a more popular competition — replace
          stats[existing.difficulty]--;
          rows[existing.index] = null as any; // mark for removal
          stats.deduped++;
        } else {
          stats.deduped++;
          continue; // keep the existing easier version
        }
      }

      const idx = rows.length;
      seenSlugs.set(team.slug, { difficulty, index: idx });

      rows.push({
        category: 'LOGO_QUIZ',
        difficulty,
        used: false,
        question: {
          id: randomUUID(),
          question_text: 'Identify this football club from its logo',
          correct_answer: team.team_name,
          explanation: `This is the logo of ${team.team_name}`,
          category: 'LOGO_QUIZ',
          difficulty,
          points: POINTS[difficulty],
          image_url: imageUrl,
          fifty_fifty_hint: null,
          fifty_fifty_applicable: false,
          meta: {
            slug: team.slug,
            league: team.league ?? comp,
            competition: comp,
            country: team.country ?? '',
            original_image_url: team.real_image_url,
          },
        },
      });

      stats[difficulty]++;
    }
  }

  // Filter out nulled-out entries from dedup replacements
  const finalRows = rows.filter(Boolean);

  console.log(`\n  New questions to seed:`);
  console.log(`    EASY:    ${stats.EASY} (famous teams)`);
  console.log(`    MEDIUM:  ${stats.MEDIUM} (known teams)`);
  console.log(`    HARD:    ${stats.HARD} (obscure teams)`);
  console.log(`    Skipped: ${stats.skipped} (no erasure image)`);
  console.log(`    Deduped: ${stats.deduped} (cross-competition duplicates)`);
  console.log(`    Total:   ${finalRows.length}`);

  if (dryRun) {
    console.log('\n  Dry run — not inserting.');
    // Show examples per tier
    for (const diff of ['EASY', 'MEDIUM', 'HARD'] as Difficulty[]) {
      const examples = finalRows
        .filter((r) => r.difficulty === diff)
        .slice(0, 5)
        .map((r) => r.question.correct_answer);
      console.log(`\n  ${diff} examples: ${examples.join(', ')}`);
    }
    return;
  }

  // Step 3: Insert in batches
  let inserted = 0;
  const batchSize = 100;
  for (let i = 0; i < finalRows.length; i += batchSize) {
    const batch = finalRows.slice(i, i + batchSize);
    const { error } = await supabase.from('question_pool').insert(batch);
    if (error) {
      console.error(`  Insert error at ${i}: ${error.message}`);
      continue;
    }
    inserted += batch.length;
  }

  console.log(`\n  Seeded: ${inserted} questions`);

  // Verify
  const { count } = await supabase
    .from('question_pool')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'LOGO_QUIZ');
  console.log(`  Verified in DB: ${count}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
