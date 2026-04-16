/**
 * Delete orphaned medium.webp erasures from logo-quiz storage bucket.
 * These are no longer referenced (MEDIUM difficulty is not used in the game).
 *
 * Usage:
 *   npx ts-node scripts/delete-medium-erasures.ts --dry-run  # list only
 *   npx ts-node scripts/delete-medium-erasures.ts            # actually delete
 */
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'logo-quiz';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Scanning ${BUCKET}/erasures for medium.webp files...`);
  console.log(`Dry run: ${dryRun}\n`);

  // List all slug folders under erasures/
  const slugFolders: string[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list('erasures', {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list erasures: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      if (item.id === null) slugFolders.push(item.name); // null id = folder
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  console.log(`Found ${slugFolders.length} slug folders\n`);

  // For each folder, check for medium.webp
  const mediumPaths: string[] = [];
  let checked = 0;
  for (const slug of slugFolders) {
    const { data, error } = await supabase.storage.from(BUCKET).list(`erasures/${slug}`);
    if (error) {
      console.warn(`  ⚠ could not list ${slug}: ${error.message}`);
      continue;
    }
    if (data?.some((f) => f.name === 'medium.webp')) {
      mediumPaths.push(`erasures/${slug}/medium.webp`);
    }
    checked++;
    if (checked % 100 === 0) console.log(`  scanned ${checked}/${slugFolders.length}`);
  }

  console.log(`\nFound ${mediumPaths.length} medium.webp files to delete`);
  if (mediumPaths.length === 0) return;

  console.log('Sample:');
  mediumPaths.slice(0, 5).forEach((p) => console.log(`  ${p}`));
  if (mediumPaths.length > 5) console.log(`  ... and ${mediumPaths.length - 5} more`);

  if (dryRun) {
    console.log('\nDry run — no deletion performed.');
    return;
  }

  // Delete in batches of 100 (Supabase remove accepts arrays)
  let deleted = 0;
  let errors = 0;
  const batchSize = 100;
  for (let i = 0; i < mediumPaths.length; i += batchSize) {
    const batch = mediumPaths.slice(i, i + batchSize);
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`  batch ${i} error: ${error.message}`);
      errors += batch.length;
    } else {
      deleted += data?.length ?? 0;
      console.log(`  deleted ${deleted}/${mediumPaths.length}`);
    }
  }

  console.log(`\n✓ Deleted ${deleted} files, ${errors} errors`);
}

main().catch((e) => {
  console.error('✗ FAILED:', e.message);
  process.exit(1);
});
