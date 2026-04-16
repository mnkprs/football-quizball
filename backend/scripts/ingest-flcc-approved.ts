/**
 * Ingest approved flcc-batch logos into production.
 *
 * Reads:
 *   backend/scripts/_flcc-downloads/new-logos.json    (crawler output)
 *   backend/scripts/_flcc-downloads/decisions.json    (manual approve/reject)
 *   footy-logos.json                                   (existing production pool)
 *
 * For each approved slug NOT already in footy-logos.json:
 *   - Converts original PNG → webp, uploads to   logo-quiz/originals/{slug}.webp
 *   - Uploads _easy/{slug}.easy.webp            → logo-quiz/erasures/{slug}/easy.webp
 *   - Uploads _hard/{slug}.hard.webp            → logo-quiz/erasures/{slug}/hard.webp
 *   - Appends entry to footy-logos.json under synthetic comp key "{country-lowercase}-clubs"
 *
 * Then seeds question_pool with EASY + HARD (no MEDIUM since flcc batch has no medium).
 *
 * Usage:
 *   npx ts-node scripts/ingest-flcc-approved.ts --dry-run   # plan only
 *   npx ts-node scripts/ingest-flcc-approved.ts             # execute
 *   npx ts-node scripts/ingest-flcc-approved.ts --skip-seed # upload only, skip DB seed
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'logo-quiz';

const FLCC_ROOT = path.join(__dirname, '_flcc-downloads');
const NEW_LOGOS_JSON = path.join(FLCC_ROOT, 'new-logos.json');
const DECISIONS_JSON = path.join(FLCC_ROOT, 'decisions.json');
const FOOTY_LOGOS_JSON = path.join(__dirname, '..', '..', 'footy-logos.json');

interface FlccLogo {
  team_name: string;
  slug: string;
  alt_names: string[];
  country: string;
  source_image_url: string;
}

interface FootyLogoEntry {
  team_name: string;
  slug: string;
  real_image_url: string;
  image_url: string | null;
  hard_image_url: string | null;
  difficulty: string | null;
  league: string;
  country: string;
  team_popularity: number;
  league_popularity: number;
}

interface FootyLogosJson {
  by_competition: Record<string, FootyLogoEntry[]>;
}

function publicUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

async function pngToWebpBuffer(pngPath: string): Promise<Buffer> {
  return sharp(pngPath)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .webp({ quality: 90 })
    .toBuffer();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipSeed = process.argv.includes('--skip-seed');

  console.log('FLCC Approved Ingestion');
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Skip seed: ${skipSeed}`);

  const newLogos = JSON.parse(fs.readFileSync(NEW_LOGOS_JSON, 'utf-8')) as { by_country: Record<string, FlccLogo[]> };
  const decisions = JSON.parse(fs.readFileSync(DECISIONS_JSON, 'utf-8')) as Record<string, 'approve' | 'reject'>;
  const footy = JSON.parse(fs.readFileSync(FOOTY_LOGOS_JSON, 'utf-8')) as FootyLogosJson;

  const existingSlugs = new Set<string>();
  for (const teams of Object.values(footy.by_competition)) {
    for (const t of teams) existingSlugs.add(t.slug);
  }

  const approvedEntries: Array<{ logo: FlccLogo; country: string }> = [];
  let skippedRejected = 0;
  let skippedDuplicate = 0;
  let skippedMissingFiles = 0;

  for (const [country, logos] of Object.entries(newLogos.by_country)) {
    for (const logo of logos) {
      const key = `${country}/${logo.slug}`;
      if (decisions[key] !== 'approve') {
        if (decisions[key] === 'reject') skippedRejected++;
        continue;
      }
      if (existingSlugs.has(logo.slug)) { skippedDuplicate++; continue; }

      const pngPath = path.join(FLCC_ROOT, country.toLowerCase(), `${logo.slug}.png`);
      const easyPath = path.join(FLCC_ROOT, country.toLowerCase(), '_easy', `${logo.slug}.easy.webp`);
      const hardPath = path.join(FLCC_ROOT, country.toLowerCase(), '_hard', `${logo.slug}.hard.webp`);
      if (!fs.existsSync(pngPath) || !fs.existsSync(easyPath) || !fs.existsSync(hardPath)) {
        skippedMissingFiles++;
        continue;
      }
      approvedEntries.push({ logo, country });
    }
  }

  console.log(`\nFilter results:`);
  console.log(`  Approved + new + files present: ${approvedEntries.length}`);
  console.log(`  Skipped rejected:      ${skippedRejected}`);
  console.log(`  Skipped duplicate:     ${skippedDuplicate}`);
  console.log(`  Skipped missing files: ${skippedMissingFiles}`);

  if (approvedEntries.length === 0) {
    console.log('\nNothing to ingest. Exiting.');
    return;
  }

  if (dryRun) {
    console.log('\nDry run — first 10 entries to ingest:');
    for (const { logo, country } of approvedEntries.slice(0, 10)) {
      console.log(`  ${country}/${logo.slug} (${logo.team_name})`);
    }
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let uploaded = 0;
  let errors = 0;
  const newFootyEntries: Array<{ comp: string; entry: FootyLogoEntry }> = [];

  for (const { logo, country } of approvedEntries) {
    const slug = logo.slug;
    const countryLc = country.toLowerCase();
    const pngPath = path.join(FLCC_ROOT, countryLc, `${slug}.png`);
    const easyPath = path.join(FLCC_ROOT, countryLc, '_easy', `${slug}.easy.webp`);
    const hardPath = path.join(FLCC_ROOT, countryLc, '_hard', `${slug}.hard.webp`);

    try {
      // Original PNG → webp upload
      const originalWebp = await pngToWebpBuffer(pngPath);
      const originalStorage = `originals/${slug}.webp`;
      {
        const { error } = await supabase.storage.from(BUCKET).upload(originalStorage, originalWebp, {
          contentType: 'image/webp', upsert: true,
        });
        if (error) throw new Error(`original upload: ${error.message}`);
      }

      // EASY webp upload (already sized/formatted correctly from vertex)
      const easyStorage = `erasures/${slug}/easy.webp`;
      {
        const buffer = fs.readFileSync(easyPath);
        const { error } = await supabase.storage.from(BUCKET).upload(easyStorage, buffer, {
          contentType: 'image/webp', upsert: true,
        });
        if (error) throw new Error(`easy upload: ${error.message}`);
      }

      // HARD webp upload
      const hardStorage = `erasures/${slug}/hard.webp`;
      {
        const buffer = fs.readFileSync(hardPath);
        const { error } = await supabase.storage.from(BUCKET).upload(hardStorage, buffer, {
          contentType: 'image/webp', upsert: true,
        });
        if (error) throw new Error(`hard upload: ${error.message}`);
      }

      const comp = `${countryLc}-clubs`;
      newFootyEntries.push({
        comp,
        entry: {
          team_name: logo.team_name,
          slug,
          real_image_url: publicUrl(originalStorage),
          image_url: publicUrl(easyStorage),
          hard_image_url: publicUrl(hardStorage),
          difficulty: null,
          league: `${country} clubs`,
          country,
          team_popularity: 1,
          league_popularity: 1,
        },
      });

      uploaded++;
      if (uploaded % 20 === 0) {
        console.log(`  Progress: ${uploaded}/${approvedEntries.length} uploaded`);
      }
    } catch (err: any) {
      console.error(`  ERROR ${slug}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nUpload: ${uploaded} succeeded, ${errors} errors`);

  if (newFootyEntries.length === 0) {
    console.log('Nothing to write. Exiting.');
    return;
  }

  // Append to footy-logos.json
  for (const { comp, entry } of newFootyEntries) {
    if (!footy.by_competition[comp]) footy.by_competition[comp] = [];
    footy.by_competition[comp].push(entry);
  }
  fs.writeFileSync(FOOTY_LOGOS_JSON, JSON.stringify(footy, null, 2));
  console.log(`Wrote ${newFootyEntries.length} new entries to footy-logos.json`);

  if (skipSeed) {
    console.log('Skipping question_pool seed (--skip-seed).');
    return;
  }

  // Seed question_pool — EASY and HARD only (no MEDIUM for flcc batch)
  console.log(`\nSeeding question_pool with ${newFootyEntries.length} teams × 2 difficulties...`);
  const DIFFICULTY_CONFIG = [
    { difficulty: 'EASY', points: 10, urlKey: 'image_url' as const },
    { difficulty: 'HARD', points: 30, urlKey: 'hard_image_url' as const },
  ];

  const rows: any[] = [];
  for (const { comp, entry } of newFootyEntries) {
    for (const { difficulty, points, urlKey } of DIFFICULTY_CONFIG) {
      const imageUrl = entry[urlKey];
      if (!imageUrl) continue;

      rows.push({
        category: 'LOGO_QUIZ',
        difficulty,
        used: false,
        question: {
          id: randomUUID(),
          question_text: 'Identify this football club from its logo',
          correct_answer: entry.team_name,
          explanation: `This is the logo of ${entry.team_name}`,
          category: 'LOGO_QUIZ',
          difficulty,
          points,
          image_url: imageUrl,
          fifty_fifty_hint: null,
          fifty_fifty_applicable: false,
          meta: {
            slug: entry.slug,
            league: entry.league,
            country: entry.country,
            original_image_url: entry.real_image_url,
          },
        },
      });
    }
  }

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

  console.log(`Seeded: ${seeded} question rows (${seeded / 2} teams × 2 difficulties)`);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
