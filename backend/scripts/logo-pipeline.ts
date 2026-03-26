/**
 * Logo Quiz — Asset Pipeline
 *
 * 1. Creates a 'logo-quiz' storage bucket in our Supabase
 * 2. Downloads all original SVG logos from CDN → rasterizes to WebP → uploads
 * 3. Downloads existing erasure images (412 teams) from external Supabase → re-uploads
 * 4. Generates erasure stages for remaining teams using contour script
 * 5. Updates footy-logos.json with our own Supabase URLs
 *
 * Usage: npx ts-node scripts/logo-pipeline.ts [--step=1|2|3|4|5] [--limit=N]
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'logo-quiz';
const LOGOS_JSON = path.join(__dirname, '..', '..', 'footy-logos.json');
const OUTPUT_SIZE = 512;

// External Supabase where existing erasure images live
const EXTERNAL_SUPABASE = 'polhepsikshzgwjwltgt.supabase.co';

interface TeamLogo {
  team_name: string;
  slug: string;
  real_image_url: string;
  image_url?: string;
  medium_image_url?: string;
  hard_image_url?: string;
  difficulty?: string;
  league?: string;
  country?: string;
}

interface LogosJson {
  by_competition: Record<string, TeamLogo[]>;
}

function parseArgs(): { step?: number; limit?: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let step: number | undefined;
  let limit: number | undefined;
  let dryRun = false;
  for (const a of args) {
    if (a.startsWith('--step=')) step = parseInt(a.split('=')[1]);
    if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1]);
    if (a === '--dry-run') dryRun = true;
  }
  return { step, limit, dryRun };
}

function loadLogos(): LogosJson {
  return JSON.parse(fs.readFileSync(LOGOS_JSON, 'utf-8'));
}

function saveLogos(data: LogosJson): void {
  fs.writeFileSync(LOGOS_JSON, JSON.stringify(data, null, 2));
}

function getAllTeams(data: LogosJson): { comp: string; team: TeamLogo }[] {
  const teams: { comp: string; team: TeamLogo }[] = [];
  for (const [comp, list] of Object.entries(data.by_competition)) {
    for (const team of list) {
      teams.push({ comp, team });
    }
  }
  return teams;
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function svgToWebp(svgBuffer: Buffer): Promise<Buffer> {
  return sharp(svgBuffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .webp({ quality: 85 })
    .toBuffer();
}

async function pngToWebp(pngBuffer: Buffer): Promise<Buffer> {
  return sharp(pngBuffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .webp({ quality: 85 })
    .toBuffer();
}

async function uploadToSupabase(
  supabase: SupabaseClient,
  filePath: string,
  buffer: Buffer,
  contentType = 'image/webp',
): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });
  if (error) throw new Error(`Upload failed ${filePath}: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ──────────────────────────────────────────────────────
// Step 1: Create bucket
// ──────────────────────────────────────────────────────
async function step1CreateBucket(supabase: SupabaseClient): Promise<void> {
  console.log('\n=== Step 1: Create storage bucket ===');

  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.find((b) => b.name === BUCKET)) {
    console.log(`  Bucket '${BUCKET}' already exists`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/webp', 'image/png', 'image/svg+xml'],
  });
  if (error) throw new Error(`Create bucket failed: ${error.message}`);
  console.log(`  Created bucket '${BUCKET}' (public)`);
}

// ──────────────────────────────────────────────────────
// Step 2: Download + upload all original logos
// ──────────────────────────────────────────────────────
async function step2UploadOriginals(
  supabase: SupabaseClient,
  limit?: number,
): Promise<void> {
  console.log('\n=== Step 2: Upload original logos ===');
  const data = loadLogos();
  const teams = getAllTeams(data);
  const toProcess = limit ? teams.slice(0, limit) : teams;

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const { team } of toProcess) {
    if (!team.real_image_url) {
      skipped++;
      continue;
    }

    const storagePath = `originals/${team.slug}.webp`;

    // Check if already uploaded by looking for our URL pattern
    try {
      const svgBuffer = await downloadBuffer(team.real_image_url);
      const webpBuffer = await svgToWebp(svgBuffer);
      const publicUrl = await uploadToSupabase(
        supabase,
        storagePath,
        webpBuffer,
      );

      // Update the real_image_url to point to our Supabase
      team.real_image_url = publicUrl;
      uploaded++;

      if (uploaded % 50 === 0) {
        console.log(`  Progress: ${uploaded}/${toProcess.length} uploaded`);
        saveLogos(data); // Periodic save
      }
    } catch (err: any) {
      console.error(`  ERROR ${team.team_name}: ${err.message}`);
      errors++;
    }

    // Rate limit: small delay to avoid hammering CDN
    if (uploaded % 10 === 0) await sleep(100);
  }

  saveLogos(data);
  console.log(
    `  Done: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`,
  );
}

// ──────────────────────────────────────────────────────
// Step 3: Download existing erasure images from external Supabase
// ──────────────────────────────────────────────────────
async function step3MigrateExisting(
  supabase: SupabaseClient,
  limit?: number,
): Promise<void> {
  console.log('\n=== Step 3: Migrate existing erasure images ===');
  const data = loadLogos();
  const teams = getAllTeams(data);

  // Find teams that have existing erasure images on external Supabase
  const withErasures = teams.filter(
    ({ team }) =>
      team.image_url &&
      team.image_url.includes(EXTERNAL_SUPABASE) &&
      team.medium_image_url &&
      team.hard_image_url,
  );

  const toProcess = limit ? withErasures.slice(0, limit) : withErasures;
  console.log(
    `  Found ${withErasures.length} teams with existing erasures (processing ${toProcess.length})`,
  );

  let migrated = 0;
  let errors = 0;

  for (const { team } of toProcess) {
    try {
      const levels = [
        { key: 'image_url' as const, suffix: 'easy' },
        { key: 'medium_image_url' as const, suffix: 'medium' },
        { key: 'hard_image_url' as const, suffix: 'hard' },
      ];

      for (const { key, suffix } of levels) {
        const url = team[key];
        if (!url) continue;

        const imgBuffer = await downloadBuffer(url);
        const webpBuffer = await pngToWebp(imgBuffer);
        const storagePath = `erasures/${team.slug}/${suffix}.webp`;
        const publicUrl = await uploadToSupabase(
          supabase,
          storagePath,
          webpBuffer,
        );
        team[key] = publicUrl;
      }

      migrated++;
      if (migrated % 20 === 0) {
        console.log(
          `  Progress: ${migrated}/${toProcess.length} migrated`,
        );
        saveLogos(data);
      }
    } catch (err: any) {
      console.error(`  ERROR ${team.team_name}: ${err.message}`);
      errors++;
    }

    if (migrated % 10 === 0) await sleep(100);
  }

  saveLogos(data);
  console.log(`  Done: ${migrated} migrated, ${errors} errors`);
}

// ──────────────────────────────────────────────────────
// Step 4: Generate erasures for teams that don't have them
// (calls the Python contour script per-team)
// ──────────────────────────────────────────────────────
async function step4GenerateErasures(
  supabase: SupabaseClient,
  limit?: number,
): Promise<void> {
  console.log('\n=== Step 4: Generate erasures for remaining teams ===');
  const data = loadLogos();
  const teams = getAllTeams(data);

  // Find teams WITHOUT erasure images (or with our Supabase URL already)
  const needGeneration = teams.filter(({ team }) => {
    const hasOurs =
      team.image_url?.includes('npwneqworgyclzaofuln.supabase.co');
    const hasExternal =
      team.image_url?.includes(EXTERNAL_SUPABASE);
    return !team.image_url || (!hasOurs && !hasExternal);
  });

  const toProcess = limit ? needGeneration.slice(0, limit) : needGeneration;
  console.log(
    `  Found ${needGeneration.length} teams needing generation (processing ${toProcess.length})`,
  );

  // This will be implemented when we integrate the contour script
  // For now, just log what needs to be done
  console.log('  TODO: Integrate contour pipeline here');
  console.log(
    `  First 10: ${toProcess
      .slice(0, 10)
      .map(({ team }) => team.team_name)
      .join(', ')}`,
  );
}

// ──────────────────────────────────────────────────────
// Step 5: Summary / validation
// ──────────────────────────────────────────────────────
async function step5Summary(): Promise<void> {
  console.log('\n=== Step 5: Summary ===');
  const data = loadLogos();
  const teams = getAllTeams(data);

  let total = 0;
  let hasOriginal = 0;
  let hasEasy = 0;
  let hasMedium = 0;
  let hasHard = 0;
  let onOurSupabase = 0;
  let onExternalSupabase = 0;
  let onCdn = 0;

  for (const { team } of teams) {
    total++;
    if (team.real_image_url) hasOriginal++;
    if (team.image_url) hasEasy++;
    if (team.medium_image_url) hasMedium++;
    if (team.hard_image_url) hasHard++;

    if (team.real_image_url?.includes('npwneqworgyclzaofuln'))
      onOurSupabase++;
    else if (team.real_image_url?.includes(EXTERNAL_SUPABASE))
      onExternalSupabase++;
    else if (team.real_image_url) onCdn++;
  }

  console.log(`  Total teams:         ${total}`);
  console.log(`  Has original:        ${hasOriginal}`);
  console.log(`  Has easy:            ${hasEasy}`);
  console.log(`  Has medium:          ${hasMedium}`);
  console.log(`  Has hard:            ${hasHard}`);
  console.log(`  Needs generation:    ${total - hasEasy}`);
  console.log();
  console.log(`  On our Supabase:     ${onOurSupabase}`);
  console.log(`  On external Supabase: ${onExternalSupabase}`);
  console.log(`  On CDN:              ${onCdn}`);
}

// ──────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────
async function main() {
  const { step, limit, dryRun } = parseArgs();

  console.log('Logo Quiz — Asset Pipeline');
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Bucket: ${BUCKET}`);
  console.log(`  Step: ${step ?? 'all'}`);
  console.log(`  Limit: ${limit ?? 'none'}`);
  console.log(`  Dry run: ${dryRun}`);

  if (dryRun) {
    await step5Summary();
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  if (!step || step === 1) await step1CreateBucket(supabase);
  if (!step || step === 2) await step2UploadOriginals(supabase, limit);
  if (!step || step === 3) await step3MigrateExisting(supabase, limit);
  if (!step || step === 4) await step4GenerateErasures(supabase, limit);
  if (!step || step === 5) await step5Summary();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
