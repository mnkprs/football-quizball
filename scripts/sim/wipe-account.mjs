/**
 * Comprehensive Account Wipe Script
 * Clears all user data from all tables + resets profiles to factory defaults.
 *
 * Reads SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY from backend/.env.
 * Credentials for the target account come from env vars (never hardcoded):
 *   WIPE_EMAIL, WIPE_PASSWORD — or pass email as CLI arg.
 *
 * Usage:
 *   WIPE_EMAIL=user@x.com WIPE_PASSWORD=... node wipe-account.mjs
 *   WIPE_PASSWORD=... node wipe-account.mjs user@x.com
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { createClient } = require('../../backend/node_modules/@supabase/supabase-js');

// Path-independent env read — resolves backend/.env relative to this file,
// not the caller's cwd. Same pattern as e2e-game-sim.mjs / duel-batch.mjs.
function readEnvKey(key) {
  const raw = readFileSync(new URL('../../backend/.env', import.meta.url), 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in backend/.env`);
  return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
}

// Supabase URL + anon key are safe to embed (anon is a public key by design)
const SUPABASE_URL = 'https://npwneqworgyclzaofuln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo';
const EMAIL = process.argv[2] || process.env.WIPE_EMAIL;
const PASSWORD = process.env.WIPE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('✗ Missing required credentials.');
  console.error('  Set WIPE_EMAIL (or pass as arg) and WIPE_PASSWORD env vars.');
  console.error('  Example: WIPE_EMAIL=a@b.com WIPE_PASSWORD=... node wipe-account.mjs');
  process.exit(1);
}

// Get user ID by email
async function getUserByEmail(email) {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  return data.user.id;
}

// Comprehensive account wipe
async function wipeAccount(userId) {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE ACCOUNT WIPE              ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvKey('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(SUPABASE_URL, key);

  // Tables to delete (via user_id column)
  const userIdTables = [
    'elo_history',
    'xp_history',
    'user_achievements',
    'user_mode_stats',
    'blitz_scores',
  ];

  console.log('📋 Deleting from user_id-based tables:');
  for (const table of userIdTables) {
    try {
      const { count, error } = await admin
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', userId);

      if (!error) {
        console.log(`   ✓ ${table}: ${count ?? 0} rows deleted`);
      } else if (error.code === 'PGRST116') {
        console.log(`   ⊘ ${table}: table does not exist (skipped)`);
      } else {
        console.log(`   ⚠ ${table}: ${error.message}`);
      }
    } catch (e) {
      console.log(`   ⚠ ${table}: ${e.message}`);
    }
  }

  // match_history: delete via player1_id OR player2_id
  console.log('\n📋 Deleting from match_history:');
  try {
    const { count, error } = await admin
      .from('match_history')
      .delete({ count: 'exact' })
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

    if (!error) {
      console.log(`   ✓ match_history: ${count ?? 0} rows deleted`);
    } else {
      console.log(`   ⚠ match_history: ${error.message}`);
    }
  } catch (e) {
    console.log(`   ⚠ match_history: ${e.message}`);
  }

  // duel_games: delete via host_id OR guest_id
  console.log('\n📋 Deleting from duel_games:');
  try {
    const { count, error } = await admin
      .from('duel_games')
      .delete({ count: 'exact' })
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`);

    if (!error) {
      console.log(`   ✓ duel_games: ${count ?? 0} rows deleted`);
    } else if (error.code === 'PGRST116') {
      console.log(`   ⊘ duel_games: table does not exist (skipped)`);
    } else {
      console.log(`   ⚠ duel_games: ${error.message}`);
    }
  } catch (e) {
    console.log(`   ⚠ duel_games: ${e.message}`);
  }

  // Reset profile to factory defaults
  console.log('\n📋 Resetting profile to factory defaults:');
  const { error: pErr } = await admin.from('profiles').update({
    elo: 1000,
    logo_quiz_elo: 1000,
    logo_quiz_hardcore_elo: 1000,
    games_played: 0,
    questions_answered: 0,
    correct_answers: 0,
    logo_quiz_games_played: 0,
    logo_quiz_hardcore_games_played: 0,
    level: 1,
    xp: 0,
  }).eq('id', userId);

  if (pErr) {
    console.log(`   ⚠ profiles update failed: ${pErr.message}`);
  } else {
    console.log('   ✓ profiles: ELO=1000, level=1, xp=0, all stats=0');
  }

  // Verify the wipe by reading the profile
  console.log('\n✅ VERIFICATION:');
  const { data: profile, error: vErr } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (vErr) {
    console.log(`   ⚠ Could not verify: ${vErr.message}`);
  } else if (!profile) {
    console.log('   ⚠ Profile not found');
  } else {
    console.log(`   ✓ elo: ${profile.elo}`);
    console.log(`   ✓ logo_quiz_elo: ${profile.logo_quiz_elo}`);
    console.log(`   ✓ logo_quiz_hardcore_elo: ${profile.logo_quiz_hardcore_elo}`);
    console.log(`   ✓ games_played: ${profile.games_played}`);
    console.log(`   ✓ questions_answered: ${profile.questions_answered}`);
    console.log(`   ✓ correct_answers: ${profile.correct_answers}`);
    console.log(`   ✓ logo_quiz_games_played: ${profile.logo_quiz_games_played}`);
    console.log(`   ✓ logo_quiz_hardcore_games_played: ${profile.logo_quiz_hardcore_games_played}`);
    console.log(`   ✓ level: ${profile.level}`);
    console.log(`   ✓ xp: ${profile.xp}`);
  }
}

// Main
(async () => {
  console.log(`Email: ${EMAIL}`);
  try {
    const userId = await getUserByEmail(EMAIL);
    console.log(`User ID: ${userId}\n`);
    await wipeAccount(userId);
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║   ✓ WIPE COMPLETE — FRESH START READY     ║');
    console.log('╚═══════════════════════════════════════════╝\n');
  } catch (e) {
    console.error('\n✗ FAILED:', e.message);
    process.exit(1);
  }
})();
