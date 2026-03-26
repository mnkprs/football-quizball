/**
 * Upload generated erasure images from batch-generate-erasures.py output.
 *
 * Reads the manifest from /private/tmp/logo-erasures/manifest.json,
 * uploads successful results to Supabase storage, updates footy-logos.json,
 * and seeds new questions into question_pool.
 *
 * Usage: npx ts-node scripts/upload-generated-erasures.ts [--dry-run] [--skip-seed]
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'logo-quiz';
const ERASURES_DIR = '/private/tmp/logo-erasures';
const MANIFEST_PATH = path.join(ERASURES_DIR, 'manifest.json');
const LOGOS_JSON = path.join(__dirname, '..', '..', 'footy-logos.json');

interface ManifestEntry {
  slug: string;
  name: string;
  reason: string;
}

interface Manifest {
  timestamp: string;
  total_processed: number;
  success_count: number;
  failed_count: number;
  elapsed_seconds: number;
  success: ManifestEntry[];
  failed: ManifestEntry[];
}

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

interface LogosJson {
  by_competition: Record<string, TeamLogo[]>;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipSeed = process.argv.includes('--skip-seed');

  console.log('Upload Generated Erasures');
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Skip seed: ${skipSeed}`);

  // Read manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('No manifest found. Run batch-generate-erasures.py first.');
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(
    fs.readFileSync(MANIFEST_PATH, 'utf-8'),
  );
  console.log(`  Generated: ${manifest.timestamp}`);
  console.log(`  Success: ${manifest.success_count}`);
  console.log(`  Failed: ${manifest.failed_count}`);

  if (manifest.success_count === 0) {
    console.log('  No successful results to upload.');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const data: LogosJson = JSON.parse(fs.readFileSync(LOGOS_JSON, 'utf-8'));

  // Build slug → team lookup
  const slugToTeam = new Map<string, { comp: string; team: TeamLogo }>();
  for (const [comp, teams] of Object.entries(data.by_competition)) {
    for (const team of teams) {
      if (!slugToTeam.has(team.slug)) {
        slugToTeam.set(team.slug, { comp, team });
      }
    }
  }

  let uploaded = 0;
  let errors = 0;
  const seededSlugs: string[] = [];

  for (const entry of manifest.success) {
    const slugDir = path.join(ERASURES_DIR, entry.slug);
    const easyPath = path.join(slugDir, 'easy.webp');
    const mediumPath = path.join(slugDir, 'medium.webp');
    const hardPath = path.join(slugDir, 'hard.webp');

    if (
      !fs.existsSync(easyPath) ||
      !fs.existsSync(mediumPath) ||
      !fs.existsSync(hardPath)
    ) {
      console.error(`  SKIP ${entry.slug}: missing files`);
      errors++;
      continue;
    }

    if (dryRun) {
      uploaded++;
      continue;
    }

    try {
      const levels = [
        { localPath: easyPath, storagePath: `erasures/${entry.slug}/easy.webp`, key: 'image_url' as const },
        { localPath: mediumPath, storagePath: `erasures/${entry.slug}/medium.webp`, key: 'medium_image_url' as const },
        { localPath: hardPath, storagePath: `erasures/${entry.slug}/hard.webp`, key: 'hard_image_url' as const },
      ];

      for (const { localPath, storagePath, key } of levels) {
        const buffer = fs.readFileSync(localPath);
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, buffer, {
            contentType: 'image/webp',
            upsert: true,
          });
        if (error) throw new Error(`Upload ${storagePath}: ${error.message}`);

        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(storagePath);

        // Update footy-logos.json
        const teamEntry = slugToTeam.get(entry.slug);
        if (teamEntry) {
          teamEntry.team[key] = urlData.publicUrl;
        }
      }

      seededSlugs.push(entry.slug);
      uploaded++;

      if (uploaded % 50 === 0) {
        console.log(`  Progress: ${uploaded}/${manifest.success_count} uploaded`);
        fs.writeFileSync(LOGOS_JSON, JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      console.error(`  ERROR ${entry.slug}: ${err.message}`);
      errors++;
    }

    if (uploaded % 10 === 0) await sleep(50);
  }

  // Save JSON
  if (!dryRun) {
    fs.writeFileSync(LOGOS_JSON, JSON.stringify(data, null, 2));
  }

  console.log(`\n  Upload: ${uploaded} uploaded, ${errors} errors`);

  // Seed questions
  if (!skipSeed && !dryRun && seededSlugs.length > 0) {
    console.log(`\n  Seeding ${seededSlugs.length} teams into question_pool...`);

    // Check existing to avoid duplicates
    const { data: existing } = await supabase
      .from('question_pool')
      .select('question')
      .eq('category', 'LOGO_QUIZ');

    const existingSlugs = new Set(
      (existing ?? []).map((row: any) => row.question?.meta?.slug),
    );

    const DIFFICULTY_CONFIG = [
      { difficulty: 'EASY', points: 10, urlKey: 'image_url' as const },
      { difficulty: 'MEDIUM', points: 20, urlKey: 'medium_image_url' as const },
      { difficulty: 'HARD', points: 30, urlKey: 'hard_image_url' as const },
    ];

    const rows: any[] = [];
    for (const slug of seededSlugs) {
      if (existingSlugs.has(slug)) continue;
      const teamEntry = slugToTeam.get(slug);
      if (!teamEntry) continue;
      const { team, comp } = teamEntry;

      for (const { difficulty, points, urlKey } of DIFFICULTY_CONFIG) {
        const imageUrl = team[urlKey];
        if (!imageUrl) continue;

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

    // Insert in batches
    let seeded = 0;
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from('question_pool').insert(batch);
      if (error) {
        console.error(`  Seed ERROR at batch ${i}: ${error.message}`);
        continue;
      }
      seeded += batch.length;
    }

    console.log(`  Seeded: ${seeded} questions (${seeded / 3} teams × 3 difficulties)`);
  }

  // Print failed teams for tracking
  if (manifest.failed.length > 0) {
    console.log(`\n  Failed teams (${manifest.failed.length}):`);
    const reasons: Record<string, number> = {};
    for (const f of manifest.failed) {
      const key = f.reason.split(':')[0];
      reasons[key] = (reasons[key] || 0) + 1;
    }
    for (const [reason, count] of Object.entries(reasons)) {
      console.log(`    ${reason}: ${count}`);
    }
  }

  console.log('\n  Done.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
