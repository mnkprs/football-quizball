/**
 * Duel batch: play N duels of a specified gameType against the bot matchmaker.
 *
 * Each duel: queue → wait for bot → answer questions (random choices / random
 * team names) → game finishes → match_history row written by the backend
 * as part of the finish path.
 *
 * Usage:
 *   DUEL_GAMETYPE=standard DUEL_COUNT=10 node duel-batch.mjs
 *   DUEL_GAMETYPE=logo     DUEL_COUNT=10 node duel-batch.mjs
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { createClient } = require('../../backend/node_modules/@supabase/supabase-js');

// ─── env from backend/.env ─────────────────────────────────────────────
try {
  const raw = readFileSync(new URL('../../backend/.env', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* ok */ }

const API = process.env.API_URL || 'https://football-quizball-production.up.railway.app';
const SUPABASE_URL = 'https://npwneqworgyclzaofuln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo';

const GAME_TYPE = (process.env.DUEL_GAMETYPE || 'standard').toLowerCase();
const COUNT = Number(process.env.DUEL_COUNT ?? 10);
// Per-question probability of submitting the peeked-correct answer.
// Over many questions in a duel (first to 5 wins), this tends toward an
// overall win rate somewhere near this number — but duel-level outcomes
// are Bernoulli draws from the question-level sampler, so a single duel's
// win/loss is noisy. Tune to 0.5 for a near-even split across the batch.
const ANSWER_CORRECT_RATE = Number(process.env.ANSWER_CORRECT_RATE ?? 0.5);
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!['standard', 'logo'].includes(GAME_TYPE)) {
  console.error(`Invalid DUEL_GAMETYPE "${GAME_TYPE}" — expected "standard" or "logo"`);
  process.exit(1);
}

let MY_USER_ID;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function getToken() {
  const email = process.env.SIM_EMAIL;
  const password = process.env.SIM_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'SIM_EMAIL and SIM_PASSWORD must be set. Add them to backend/.env ' +
      '(they auto-load) or export before running. Never hardcode — this ' +
      'file ships in git.',
    );
  }
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  MY_USER_ID = data.user.id;
  return data.session.access_token;
}

// Realistic-ish wrong guesses for free-text answers
const STANDARD_WRONGS = [
  'Lionel Messi', 'Cristiano Ronaldo', 'Maradona', 'Pele', 'Guardiola',
  'Messi', '2018', '1998', '2010', '2014', 'Barcelona', 'Real Madrid',
  'Arsenal', 'unknown', 'not sure',
];
const LOGO_WRONGS = [
  'Arsenal', 'Chelsea', 'Liverpool', 'Barcelona', 'Real Madrid',
  'Bayern Munich', 'PSG', 'Juventus', 'Milan', 'Inter',
  'Manchester United', 'Manchester City', 'Ajax', 'Boca Juniors', 'River Plate',
];

function pickWrong() {
  const pool = GAME_TYPE === 'logo' ? LOGO_WRONGS : STANDARD_WRONGS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Service-role client for peeking duel answers ──────────────────────
let _serviceClient = null;
function getServiceClient() {
  if (_serviceClient) return _serviceClient;
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — peek is required for mixed-outcome duels');
  }
  _serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

/**
 * Peek the correct answer for a duel's current question.
 *
 * Duel questions come from question_pool (standard) or logo pool
 * (logo game_type), and the per-duel pool ids are stored on the
 * `duel_games` row as `pool_question_ids`. The public API strips the
 * correct_answer before serving `currentQuestion`, so we read it
 * directly with the service role:
 *
 *   duel_games.pool_question_ids[questionIndex] → question_pool row
 *   question_pool.question (JSONB) → .correct_answer
 */
async function peekDuelAnswer(duelId, questionIndex) {
  try {
    const client = getServiceClient();
    const { data: duel, error: duelErr } = await client
      .from('duel_games')
      .select('pool_question_ids')
      .eq('id', duelId)
      .maybeSingle();
    if (duelErr || !duel?.pool_question_ids) return null;
    const qId = duel.pool_question_ids[questionIndex];
    if (!qId) return null;

    const { data: row, error: rowErr } = await client
      .from('question_pool')
      .select('question')
      .eq('id', qId)
      .maybeSingle();
    if (rowErr || !row?.question?.correct_answer) return null;
    return row.question.correct_answer;
  } catch {
    return null;
  }
}

async function playOneDuel(token, idx) {
  const startT = Date.now();
  let queueResult;
  try {
    queueResult = await api('POST', '/api/duel/queue', token, { gameType: GAME_TYPE });
  } catch (e) {
    console.log(`  [#${idx}] queue failed: ${e.message}`);
    return { success: false, reason: 'queue_failed' };
  }
  const duelId = queueResult.id;
  // DuelPublicView includes `myRole` directly — use that instead of trying
  // to reconstruct from a (nonexistent) hostId field.
  const myRole = queueResult.myRole || 'host';
  console.log(`  [#${idx}] duel ${duelId.slice(0, 8)}… (${GAME_TYPE}, role=${myRole})`);

  // Wait for bot to join + game to become active
  let game = queueResult;
  let waited = 0;
  const maxWait = GAME_TYPE === 'logo' ? 150_000 : 90_000;
  while (game.status !== 'active' && game.status !== 'finished' && waited < maxWait) {
    await sleep(3000);
    waited += 3000;
    try {
      game = await api('GET', `/api/duel/${duelId}`, token);
    } catch (e) {
      console.log(`  [#${idx}] poll failed: ${e.message}`);
      break;
    }
    if (game.status === 'waiting' && game.guestUsername) {
      try { await api('POST', `/api/duel/${duelId}/ready`, token); } catch { /* ok */ }
    }
  }

  if (game.status !== 'active' && game.status !== 'finished') {
    console.log(`  [#${idx}] never went active (${game.status}) — abandoning`);
    try { await api('POST', `/api/duel/${duelId}/abandon`, token); } catch { /* ok */ }
    return { success: false, reason: 'no_bot' };
  }

  // Answer loop — submit 15 attempts max, then poll for finish
  let answered = 0;
  let finished = game.status === 'finished';
  while (!finished && answered < 15) {
    game = await api('GET', `/api/duel/${duelId}`, token);
    if (game.status !== 'active') { finished = true; break; }
    const q = game.currentQuestion;
    const qIdx = game.currentQuestionIndex ?? 0;
    if (!q) { await sleep(1500); continue; }

    // Per-question outcome sampler: ANSWER_CORRECT_RATE of the time we
    // peek the pool's correct_answer and submit it. The other half of the
    // time we submit a wrong guess so the bot wins the question unopposed.
    //
    // Without a think-delay, instant peek-submit beats the bot's realistic
    // 3-8s think-time nearly every time, which means ANSWER_CORRECT_RATE=0.5
    // translates to ~80% duel wins, not 50%. To land near the requested
    // rate we inject a human-like pause before EVERY submit (correct OR
    // wrong) so the bot gets a fair shot. Range calibrated to overlap the
    // bot's think window while still looking like realistic play.
    let answer;
    let isCorrect = false;
    if (Math.random() < ANSWER_CORRECT_RATE) {
      const peeked = await peekDuelAnswer(duelId, qIdx);
      if (peeked) {
        answer = peeked;
        isCorrect = true;
      } else {
        // peek failed (race, deleted row, weird id) — fall through to a wrong guess
        answer = q.choices?.length ? q.choices[Math.floor(Math.random() * q.choices.length)] : pickWrong();
      }
    } else {
      answer = q.choices?.length ? q.choices[Math.floor(Math.random() * q.choices.length)] : pickWrong();
    }

    // Realistic think delay before submitting. Correct answers pause a bit
    // longer to better simulate read-comprehend-type latency; wrong
    // answers (already random guesses) submit faster. Keep total submit
    // times comfortably inside the question timer (~30s) with headroom.
    const thinkMs = isCorrect
      ? 2500 + Math.random() * 3000  // 2.5–5.5s for correct
      : 1200 + Math.random() * 1800; // 1.2–3.0s for wrong
    await sleep(thinkMs);

    try {
      const res = await api('POST', `/api/duel/${duelId}/answer`, token, { answer, questionIndex: qIdx });
      answered++;
      if (res.gameFinished) { finished = true; break; }
    } catch (e) {
      if (e.message.includes('Stale')) continue;
      if (e.message.includes('finished')) { finished = true; break; }
      // Too-fast throttle from /answer guard — wait and retry
      if (e.message.includes('429') || e.message.includes('ThrottlerException')) {
        await sleep(1100);
        continue;
      }
    }
    // No trailing pacing sleep — thinkMs above already handles submit cadence.
  }

  // Final settle — wait up to 60s for bot to finish off the game if we exhausted our turns
  waited = 0;
  while (game.status === 'active' && waited < 60_000) {
    await sleep(3000);
    waited += 3000;
    game = await api('GET', `/api/duel/${duelId}`, token);
  }

  const winnerRole = (game.scores?.host ?? 0) > (game.scores?.guest ?? 0) ? 'host'
                   : (game.scores?.guest ?? 0) > (game.scores?.host ?? 0) ? 'guest' : 'draw';
  const iWon = winnerRole === myRole;
  const dur = ((Date.now() - startT) / 1000).toFixed(1);
  console.log(`  [#${idx}] ${game.status} — scores host=${game.scores?.host ?? 0} guest=${game.scores?.guest ?? 0} | ${iWon ? 'WON' : winnerRole === 'draw' ? 'draw' : 'lost'} (${dur}s)`);
  return { success: game.status === 'finished', iWon, winnerRole };
}

async function main() {
  console.log(`\n╔═══ DUEL BATCH ═══╗ gameType=${GAME_TYPE}, count=${COUNT}`);
  const token = await getToken();
  console.log(`✓ auth as ${MY_USER_ID}\n`);

  const outcomes = [];
  for (let i = 1; i <= COUNT; i++) {
    try {
      const r = await playOneDuel(token, i);
      outcomes.push(r);
    } catch (e) {
      console.log(`  [#${i}] crash: ${e.message}`);
      outcomes.push({ success: false, reason: 'crash' });
    }
    await sleep(2000);
  }

  const wins = outcomes.filter((o) => o.iWon).length;
  const finished = outcomes.filter((o) => o.success).length;
  console.log(`\n=== ${GAME_TYPE} duel batch finished ===`);
  console.log(`  ran: ${outcomes.length} | finished: ${finished} | wins: ${wins} (${((wins/Math.max(1,finished))*100).toFixed(1)}% of finished)`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
