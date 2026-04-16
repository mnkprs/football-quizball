/**
 * Seed Logo Quiz questions into question_pool.
 *
 * Reads footy-logos.json and creates one question per difficulty level
 * for each team that has erasure images populated.
 *
 * Usage: npx ts-node scripts/seed-logo-questions.ts [--dry-run]
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID as uuid } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOGOS_JSON = path.join(__dirname, '..', '..', 'footy-logos.json');

interface TeamLogo {
  team_name: string;
  slug: string;
  real_image_url: string;
  image_url?: string;
  medium_image_url?: string;
  hard_image_url?: string;
  league?: string;
  country?: string;
}

interface LogosJson {
  by_competition: Record<string, TeamLogo[]>;
}

const DIFFICULTY_CONFIG = [
  { difficulty: 'EASY', points: 10, urlKey: 'image_url' as const },
  { difficulty: 'MEDIUM', points: 20, urlKey: 'medium_image_url' as const },
  { difficulty: 'HARD', points: 30, urlKey: 'hard_image_url' as const },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const data: LogosJson = JSON.parse(fs.readFileSync(LOGOS_JSON, 'utf-8'));
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Seed Logo Quiz Questions');
  console.log(`  Dry run: ${dryRun}`);

  // Collect all teams with erasure images
  const teams: { comp: string; team: TeamLogo }[] = [];
  for (const [comp, list] of Object.entries(data.by_competition)) {
    for (const team of list) {
      if (team.image_url && team.medium_image_url && team.hard_image_url) {
        teams.push({ comp, team });
      }
    }
  }

  console.log(`  Teams with erasures: ${teams.length}`);

  // Check existing LOGO_QUIZ questions to avoid duplicates
  const { data: existing } = await supabase
    .from('question_pool')
    .select('question')
    .eq('category', 'LOGO_QUIZ');

  const existingSlugs = new Set(
    (existing ?? []).map((row: any) => row.question?.meta?.slug),
  );
  console.log(`  Already seeded: ${existingSlugs.size}`);

  // Build question rows
  const rows: any[] = [];
  for (const { comp, team } of teams) {
    if (existingSlugs.has(team.slug)) continue;

    for (const { difficulty, points, urlKey } of DIFFICULTY_CONFIG) {
      const imageUrl = team[urlKey];
      if (!imageUrl) continue;

      const questionId = uuid();
      rows.push({
        category: 'LOGO_QUIZ',
        difficulty,
        used: false,
        question: {
          id: questionId,
          question_text: 'Identify this football club from its logo',
          correct_answer: team.team_name,
          explanation: `This is the logo of ${team.team_name}`,
          category: 'LOGO_QUIZ',
          difficulty,
          points,
          image_url: imageUrl,
          fifty_fifty_hint: null,
          fifty_fifty_applicable: false,
          meta: {
            slug: team.slug,
            league: team.league ?? comp,
            country: team.country ?? '',
            original_image_url: team.real_image_url,
          },
        },
      });
    }
  }

  console.log(`  New questions to seed: ${rows.length} (${rows.length / 3} teams × 3 difficulties)`);

  if (dryRun) {
    console.log('\n  Dry run — not inserting. Sample:');
    if (rows.length > 0) {
      const sample = rows[0];
      console.log(`    Team: ${sample.question.correct_answer}`);
      console.log(`    Difficulty: ${sample.difficulty}`);
      console.log(`    Image: ${sample.question.image_url?.substring(0, 80)}...`);
    }
    return;
  }

  // Insert in batches of 100
  let inserted = 0;
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('question_pool').insert(batch);
    if (error) {
      console.error(`  ERROR at batch ${i}: ${error.message}`);
      continue;
    }
    inserted += batch.length;
    if (inserted % 300 === 0) {
      console.log(`  Progress: ${inserted}/${rows.length}`);
    }
  }

  console.log(`  Done: ${inserted} questions seeded`);

  // Invalidate the logo-quiz team-names cache so newly-seeded logos show up
  // in the select immediately instead of waiting out the 1h TTL.
  if (inserted > 0) {
    try {
      const { Redis } = await import('ioredis');
      const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
      const redis = new Redis(url, { maxRetriesPerRequest: null });
      await redis.del('logo:team_names');
      await redis.quit();
      console.log('  Invalidated logo:team_names cache');
    } catch (err) {
      console.warn(
        `  WARN: cache invalidation failed (users may see stale select for up to 1h): ${(err as Error).message}`,
      );
    }
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
