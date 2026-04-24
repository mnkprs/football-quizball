/**
 * Analytics Data Seed Script
 *
 * 1. Wipes mnkzyy@hotmail.com's elo_history, match_history, and resets profile ELO columns
 * 2. Plays N solo-ranked rounds + M logo-quiz rounds so /analytics has fresh data to show
 *
 * Requires the backend's SUPABASE_SERVICE_ROLE_KEY (read from backend/.env).
 * Targets production (Railway + Vercel) by default.
 *
 * Usage:
 *   node analytics-sim.mjs                       # 20 solo + 15 logo_quiz rounds
 *   SOLO_ROUNDS=30 LOGO_ROUNDS=20 node analytics-sim.mjs
 *   API_URL=http://localhost:3001 node analytics-sim.mjs   # hit local backend
 */

import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
const require = createRequire(import.meta.url);
const { createClient } = require('./backend/node_modules/@supabase/supabase-js');

const API = process.env.API_URL || 'https://football-quizball-production.up.railway.app';
const EMAIL = 'mnkzyy@hotmail.com';
const PASSWORD = 'Manos1995';
const SUPABASE_URL = 'https://npwneqworgyclzaofuln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo';

const SOLO_ROUNDS = Number(process.env.SOLO_ROUNDS ?? 20);
const LOGO_ROUNDS = Number(process.env.LOGO_ROUNDS ?? 15);
const ACCURACY = Number(process.env.ACCURACY ?? 0.55); // submit correct 55% of the time
const WRONG_ANSWERS = [
  'nobody', 'unknown', 'nope', 'xyz', 'abc', 'random', 'not sure', 'idk',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Read service role key from backend/.env ─────────────────────────
function readServiceRoleKey() {
  const envPath = path.join(process.cwd(), 'backend', '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
  if (!line) throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in backend/.env');
  return line.split('=').slice(1).join('=').trim();
}

// ─── Auth ────────────────────────────────────────────────────────────
async function login() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  return { token: data.session.access_token, userId: data.user.id };
}

// ─── HTTP ────────────────────────────────────────────────────────────
async function api(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    const msg = typeof json === 'object' ? JSON.stringify(json) : json;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return json;
}

// ─── Wipe user state ────────────────────────────────────────────────
async function wipe(userId) {
  console.log('\n══ WIPE ══════════════════════════════════════');
  const key = readServiceRoleKey();
  const admin = createClient(SUPABASE_URL, key);

  // Delete all ELO + match history rows for this user
  const tables = ['elo_history', 'match_history'];
  for (const t of tables) {
    const { error, count } = await admin.from(t).delete({ count: 'exact' }).eq('user_id', userId);
    if (error) {
      // match_history may use a different user column layout; retry with player1_id/player2_id
      if (t === 'match_history') {
        const { error: e1, count: c1 } = await admin.from(t).delete({ count: 'exact' }).or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
        if (e1) { console.warn(`  ${t}: ${e1.message}`); }
        else { console.log(`  ✓ ${t}: deleted ${c1 ?? '?'} rows (via player1/player2)`); }
      } else {
        console.warn(`  ${t}: ${error.message}`);
      }
    } else {
      console.log(`  ✓ ${t}: deleted ${count ?? '?'} rows`);
    }
  }

  // Reset profile ELO + games played (all 3 tracks)
  const { error: pErr } = await admin.from('profiles').update({
    elo: 1000,
    logo_quiz_elo: 1000,
    logo_quiz_hardcore_elo: 1000,
    games_played: 0,
    questions_answered: 0,
    correct_answers: 0,
    logo_quiz_games_played: 0,
    logo_quiz_hardcore_games_played: 0,
  }).eq('id', userId);
  if (pErr) console.warn(`  profiles: ${pErr.message}`);
  else console.log('  ✓ profiles: reset ELO (solo / logo_quiz / hardcore) + counters');
}

// ─── Solo Ranked sim ─────────────────────────────────────────────────
async function runSoloRounds(token, n) {
  console.log(`\n══ SOLO RANKED × ${n} ═════════════════════════`);
  const session = await api('POST', '/api/solo/session', token);
  const sessionId = session.session_id;
  console.log(`  session: ${sessionId}`);

  let correct = 0;
  for (let i = 0; i < n; i++) {
    try {
      const q = await api('GET', `/api/solo/session/${sessionId}/next`, token);
      const shouldGuess = Math.random() < ACCURACY;
      // Without access to the correct_answer, "guessing correctly" means submitting a string
      // that might match. Use a few simple guesses + fallback to wrong answers.
      // Simpler: submit answer derived from question text or a known-wrong string.
      // We'll just submit wrong answers for a natural ~0% accuracy — that's still useful
      // analytics data (many users get low accuracy at high difficulties).
      // To get some correct answers in the mix, submit very generic football answers.
      const generic = ['Barcelona', 'Real Madrid', 'Messi', 'Ronaldo', 'Chelsea', 'Arsenal', 'Liverpool', 'Manchester United', 'Spain', 'France', 'Germany', '2014', '2018'];
      const answer = shouldGuess
        ? generic[Math.floor(Math.random() * generic.length)]
        : WRONG_ANSWERS[Math.floor(Math.random() * WRONG_ANSWERS.length)];

      await sleep(120); // don't trip time-limit guard
      const res = await api('POST', `/api/solo/session/${sessionId}/answer`, token, { answer });
      if (res.correct) correct++;
      process.stdout.write(res.correct ? '✓' : '·');
    } catch (e) {
      console.warn(`\n  ${i + 1}/${n} error: ${e.message}`);
      break;
    }
  }
  try { await api('POST', `/api/solo/session/${sessionId}/end`, token); } catch { /* ok */ }
  console.log(`\n  ✓ solo done: ${correct}/${n} correct`);
}

// ─── Logo Quiz sim ───────────────────────────────────────────────────
async function runLogoRounds(token, n) {
  console.log(`\n══ LOGO QUIZ × ${n} ════════════════════════════`);
  let correct = 0;
  for (let i = 0; i < n; i++) {
    try {
      const q = await api('GET', '/api/logo-quiz/question', token);
      if (!q?.id) {
        console.warn(`  ${i + 1}/${n} no question returned`);
        break;
      }
      // Logo quiz leaks the real team in q.team_name. Use it for correct answers,
      // wrong strings otherwise, to get realistic mixed accuracy.
      const shouldGuess = Math.random() < ACCURACY;
      const answer = shouldGuess
        ? q.team_name
        : WRONG_ANSWERS[Math.floor(Math.random() * WRONG_ANSWERS.length)];

      await sleep(120);
      const res = await api('POST', '/api/logo-quiz/answer', token, {
        question_id: q.id,
        answer,
        timed_out: false,
      });
      if (res.correct) correct++;
      process.stdout.write(res.correct ? '✓' : '·');
    } catch (e) {
      console.warn(`\n  ${i + 1}/${n} error: ${e.message}`);
      break;
    }
  }
  console.log(`\n  ✓ logo quiz done: ${correct}/${n} correct`);
}

// ─── Main ────────────────────────────────────────────────────────────
(async () => {
  console.log(`API: ${API}`);
  console.log(`User: ${EMAIL}`);
  console.log(`Rounds: solo=${SOLO_ROUNDS}, logo_quiz=${LOGO_ROUNDS}, accuracy=${ACCURACY}`);

  const { token, userId } = await login();
  console.log(`✓ logged in as ${userId}`);

  await wipe(userId);
  await runSoloRounds(token, SOLO_ROUNDS);
  await runLogoRounds(token, LOGO_ROUNDS);

  console.log('\n══ DONE ══════════════════════════════════════');
  console.log('Open /analytics — try all 3 mode tabs to see the new data.');
})().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
