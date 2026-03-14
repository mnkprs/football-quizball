#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Reset translations on mayhem_questions rows so they can be re-seeded with correct full translations.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/reset-mayhem-translations.ts
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { count, error: countErr } = await supabase
    .from('mayhem_questions')
    .select('id', { count: 'exact', head: true })
    .not('translations', 'is', null);

  if (countErr) {
    console.error('Error counting rows:', countErr.message);
    process.exit(1);
  }

  console.log(`Found ${count ?? 0} mayhem_questions rows with translations populated.`);

  if (!count || count === 0) {
    console.log('Nothing to reset.');
    return;
  }

  const { error } = await supabase
    .from('mayhem_questions')
    .update({ translations: null })
    .not('translations', 'is', null);

  if (error) {
    console.error('Error resetting translations:', error.message);
    process.exit(1);
  }

  console.log(`Done. Cleared translations on ${count} rows.`);
  console.log('You can now run: npm run mayhem:seed -- <N>');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
