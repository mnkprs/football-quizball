/**
 * E2E Game Simulation Script
 * Simulates: duel, battle royale, 2-player, N solo-ranked sessions, N logo-quiz sessions.
 * Uses production backend API.
 *
 * Phase toggles (all default ON):
 *   SIM_DUEL, SIM_BR, SIM_2P, SIM_SOLO, SIM_LOGO   → set to "0" to skip.
 *
 * Counts & targets:
 *   SOLO_SESSIONS=3        // number of solo-ranked sessions to run
 *   SOLO_QUESTIONS=20      // questions per solo session
 *   LOGO_SESSIONS=2        // number of logo-quiz sessions to run
 *   LOGO_QUESTIONS=20      // questions per logo-quiz session
 *   TARGET_ACCURACY=0.5    // target correctness rate for both
 *
 * The solo simulator peeks `question_pool.correct_answer` via service role
 * to deterministically hit the requested accuracy; the logo simulator reads
 * `team_name` directly from the question response (no DB peek needed).
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { pickShouldAnswerCorrectly } from './sim-realism.mjs';
const require = createRequire(import.meta.url);
const { createClient } = require('./backend/node_modules/@supabase/supabase-js');

// ─── Load backend/.env so SUPABASE_SERVICE_ROLE_KEY / ADMIN_API_KEY flow in
// ─── without manual export. We only read; never mutate the file.
function loadBackendEnv() {
  try {
    const raw = readFileSync(new URL('./backend/.env', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawVal] = m;
      if (process.env[key]) continue; // shell-provided wins
      // Strip surrounding quotes
      const val = rawVal.replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  } catch { /* fine — fall back to shell env */ }
}
loadBackendEnv();

const API = process.env.API_URL || 'https://football-quizball-production.up.railway.app';
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Per-player accuracy rate used to decide whether to submit the correct answer.
const P1_ACCURACY = Number(process.env.P1_ACCURACY ?? 0.65);
const P2_ACCURACY = Number(process.env.P2_ACCURACY ?? 0.45);
const TARGET_ACCURACY = Number(process.env.TARGET_ACCURACY ?? 0.5);
const SOLO_SESSIONS = Number(process.env.SOLO_SESSIONS ?? 3);
const SOLO_QUESTIONS = Number(process.env.SOLO_QUESTIONS ?? 20);
const LOGO_SESSIONS = Number(process.env.LOGO_SESSIONS ?? 2);
const LOGO_QUESTIONS = Number(process.env.LOGO_QUESTIONS ?? 20);
const SUPABASE_URL = 'https://npwneqworgyclzaofuln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo';

const phaseOn = (key) => process.env[key] !== '0';

let MY_USER_ID; // set after auth
let SERVICE_CLIENT = null; // service-role Supabase client (lazy)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitterSleep = (min, max) => sleep(min + Math.random() * (max - min));

// Realistic wrong answers for failed guesses
const WRONG_ANSWERS = ['unknown', 'nobody', 'random', 'not sure', 'idk', 'maybe', 'uncertain'];

// ─── Service-role client for DB peek (question_pool.correct_answer) ──────
function getServiceClient() {
  if (SERVICE_CLIENT) return SERVICE_CLIENT;
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not set (add it to backend/.env or export it)');
  }
  SERVICE_CLIENT = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return SERVICE_CLIENT;
}

async function peekPoolCorrectAnswer(questionId) {
  // LLM-fallback questions use synthetic ids like "solo-xxxx" and are not in question_pool.
  if (!questionId || typeof questionId !== 'string' || questionId.startsWith('solo-')) {
    return null;
  }
  const client = getServiceClient();
  // question_pool has no top-level correct_answer column — it lives inside
  // the `question` JSONB. Fetch the whole JSONB and read the field.
  const { data, error } = await client
    .from('question_pool')
    .select('question')
    .eq('id', questionId)
    .maybeSingle();
  if (error || !data) return null;
  const q = data.question;
  if (!q || typeof q !== 'object') return null;
  return q.correct_answer ?? null;
}

// ─── Auth ───────────────────────────────────────────────────────────
async function getToken() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'mnkzyy@hotmail.com',
    password: 'Manos1995',
  });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  MY_USER_ID = data.user.id;
  console.log(`✓ Authenticated as ${data.user.id}`);
  return data.session.access_token;
}

// ─── HTTP helpers ───────────────────────────────────────────────────
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

// ─── 1. DUEL (logo mode, with bot) ──────────────────────────────────
async function simulateDuel(token) {
  console.log('\n══════════════════════════════════════');
  console.log('  DUEL SIMULATION (logo mode, queue → bot match)');
  console.log('══════════════════════════════════════');

  // Try standard first, fall back to logo if pool is empty
  let queueResult;
  let gameType = 'standard';
  try {
    console.log('→ Joining duel queue (standard)...');
    queueResult = await api('POST', '/api/duel/queue', token, { gameType: 'standard' });
  } catch (e) {
    if (e.message.includes('pool is empty') || e.message.includes('Question pool')) {
      console.log('  Standard pool empty, trying logo duel...');
      gameType = 'logo';
      queueResult = await api('POST', '/api/duel/queue', token, { gameType: 'logo' });
    } else {
      throw e;
    }
  }

  const duelId = queueResult.id;
  console.log(`  Duel created: ${duelId} (status: ${queueResult.status}, type: ${gameType})`);

  // Wait for bot to join and game to become active
  // Note: bot matchmaker only fills standard duels. For logo duels we may need to wait longer
  // or the game might not get a bot. We'll poll and if it stays waiting, try to ready up.
  let game = queueResult;
  let waited = 0;
  const maxWait = gameType === 'logo' ? 120_000 : 90_000;

  while (game.status !== 'active' && waited < maxWait) {
    await sleep(3000);
    waited += 3000;
    game = await api('GET', `/api/duel/${duelId}`, token);
    const opponent = game.guestUsername || game.hostUsername || 'none';
    console.log(`  Polling... status=${game.status}, opponent=${opponent}, waited=${(waited / 1000).toFixed(0)}s`);

    // If guest joined but not active yet, try marking ready
    if (game.status === 'waiting' && game.guestUsername) {
      try {
        await api('POST', `/api/duel/${duelId}/ready`, token);
        console.log('  → Marked self as ready');
      } catch { /* already ready */ }
    }
  }

  if (game.status !== 'active') {
    // If no bot came, abandon and report
    console.log(`  ⚠ Game did not become active (status: ${game.status}). Abandoning...`);
    try { await api('POST', `/api/duel/${duelId}/abandon`, token); } catch { /* ok */ }
    throw new Error(`Duel never became active (status: ${game.status}, type: ${gameType})`);
  }

  console.log(`✓ Duel is ACTIVE — opponent: ${game.guestUsername || game.hostUsername || 'bot'}`);

  // Answer questions until game finishes
  let finished = false;
  let answeredCount = 0;

  while (!finished && answeredCount < 15) {
    game = await api('GET', `/api/duel/${duelId}`, token);
    if (game.status === 'finished' || game.status === 'abandoned') {
      finished = true;
      break;
    }

    const questionIndex = game.currentQuestionIndex ?? 0;
    const q = game.currentQuestion;
    if (!q) {
      console.log('  No current question, waiting...');
      await sleep(2000);
      continue;
    }

    // For logo duels, answer with a random team name
    const questionText = q.question_text || q.question || '';
    const answer = gameType === 'logo'
      ? ['Barcelona', 'Real Madrid', 'Liverpool', 'Bayern Munich', 'PSG', 'Arsenal'][Math.floor(Math.random() * 6)]
      : (q.choices ? q.choices[Math.floor(Math.random() * q.choices.length)] : 'random guess');

    try {
      console.log(`  Q${questionIndex}: "${questionText.substring(0, 50)}..." → "${answer}"`);
      const result = await api('POST', `/api/duel/${duelId}/answer`, token, {
        answer,
        questionIndex,
      });
      answeredCount++;
      console.log(`    correct=${result.correct}, scores=${JSON.stringify(result.scores)}, finished=${result.gameFinished || false}`);
      if (result.gameFinished) {
        finished = true;
        console.log(`    Game winner: ${result.gameWinner || 'draw'}`);
      }
    } catch (e) {
      if (e.message.includes('Stale')) {
        console.log('    Stale submission — question advanced, retrying...');
      } else if (e.message.includes('finished')) {
        finished = true;
      } else {
        console.log(`    Answer error: ${e.message}`);
      }
    }

    await sleep(1500);
  }

  // If game still active (bot hasn't finished winning), wait for it
  game = await api('GET', `/api/duel/${duelId}`, token);
  waited = 0;
  while (game.status === 'active' && waited < 120_000) {
    await sleep(5000);
    waited += 5000;
    game = await api('GET', `/api/duel/${duelId}`, token);
    if (waited % 15000 === 0) console.log(`  Waiting for duel to finish... (${(waited / 1000).toFixed(0)}s, scores: ${JSON.stringify(game.scores)})`);
  }

  console.log(`\n✓ DUEL COMPLETE — status: ${game.status}, scores: ${JSON.stringify(game.scores)}`);

  // Save to match history
  if (game.status === 'finished') {
    try {
      await api('POST', '/api/match-history', token, {
        player1_id: MY_USER_ID,
        player2_id: null,
        player1_username: game.hostUsername || 'Player',
        player2_username: game.guestUsername || 'Opponent',
        winner_id: (game.scores?.host ?? 0) > (game.scores?.guest ?? 0) ? MY_USER_ID : null,
        player1_score: game.scores?.host ?? 0,
        player2_score: game.scores?.guest ?? 0,
        match_mode: 'duel',
        game_ref_id: duelId,
        game_ref_type: 'duel',
      });
      console.log('  → Saved duel to match history');
    } catch (e) {
      console.log(`  ⚠ Failed to save duel: ${e.message}`);
    }
  }

  return { success: game.status === 'finished', duelId };
}

// ─── 2. BATTLE ROYALE ───────────────────────────────────────────────
async function simulateBattleRoyale(token) {
  console.log('\n══════════════════════════════════════');
  console.log('  BATTLE ROYALE SIMULATION');
  console.log('══════════════════════════════════════');

  // Join queue — returns { roomId, isHost }
  console.log('→ Joining battle royale queue...');
  const queueResult = await api('POST', '/api/battle-royale/queue', token);
  const roomId = queueResult.roomId;
  const isHost = queueResult.isHost;
  console.log(`  Room: ${roomId} (isHost: ${isHost})`);

  // Wait for game to become active (bot matchmaker fills + starts after 30s)
  let room = await api('GET', `/api/battle-royale/${roomId}`, token);
  let waited = 0;
  while (room.status !== 'active' && waited < 120_000) {
    await sleep(3000);
    waited += 3000;
    room = await api('GET', `/api/battle-royale/${roomId}`, token);
    const playerCount = room.players?.length ?? 0;
    console.log(`  Polling... status=${room.status}, players=${playerCount}, waited=${(waited / 1000).toFixed(0)}s`);

    // If we're host and enough time has passed, try starting manually
    if (room.status === 'waiting' && room.isHost && waited >= 15_000 && (room.players?.length ?? 0) >= 2) {
      console.log('  → Attempting manual start...');
      try {
        await api('POST', `/api/battle-royale/${roomId}/start`, token);
        await sleep(1000);
        room = await api('GET', `/api/battle-royale/${roomId}`, token);
      } catch (e) {
        console.log(`    Start failed: ${e.message}`);
      }
    }
  }

  if (room.status !== 'active') {
    throw new Error(`Battle Royale never became active (status: ${room.status})`);
  }

  const playerCount = room.players?.length ?? 0;
  console.log(`✓ Battle Royale is ACTIVE — ${playerCount} players`);

  // Answer all questions
  let myScore = 0;

  for (let i = 0; i < 12; i++) {
    room = await api('GET', `/api/battle-royale/${roomId}`, token);
    if (room.status === 'finished') break;

    // Find my state
    const myPlayer = room.players?.find((p) => p.userId === MY_USER_ID);
    if (myPlayer?.finished) {
      console.log('  All my questions answered');
      break;
    }

    const questionIndex = room.myCurrentIndex ?? i;
    const q = room.currentQuestion;
    if (!q) {
      console.log(`  Q${questionIndex}: No question yet, waiting...`);
      await sleep(2000);
      continue;
    }

    const questionText = q.question_text || q.question || q.prompt || '';
    const answer = q.choices
      ? q.choices[Math.floor(Math.random() * q.choices.length)]
      : 'random guess';

    try {
      console.log(`  Q${questionIndex}: "${questionText.substring(0, 55)}..." → "${answer}"`);
      const result = await api('POST', `/api/battle-royale/${roomId}/answer`, token, {
        questionIndex,
        answer,
      });
      myScore = result.myScore ?? myScore;
      console.log(`    correct=${result.correct}, myScore=${myScore}, finished=${result.finished || false}`);
      if (result.finished) break;
    } catch (e) {
      console.log(`    Answer error: ${e.message}`);
      if (e.message.includes('already answered') || e.message.includes('already finished')) break;
    }

    await sleep(2000 + Math.random() * 2000);
  }

  // Wait for room to finish (bots still answering)
  waited = 0;
  room = await api('GET', `/api/battle-royale/${roomId}`, token);
  while (room.status !== 'finished' && waited < 90_000) {
    await sleep(5000);
    waited += 5000;
    room = await api('GET', `/api/battle-royale/${roomId}`, token);
    if (waited % 15000 === 0) console.log(`  Waiting for room to finish... (${(waited / 1000).toFixed(0)}s)`);
  }

  // Final leaderboard
  let leaderboard;
  try {
    leaderboard = await api('GET', `/api/battle-royale/${roomId}/leaderboard`, token);
  } catch { leaderboard = null; }

  console.log(`\n✓ BATTLE ROYALE COMPLETE — status: ${room.status}, myScore: ${myScore}, players: ${room.players?.length}`);
  if (leaderboard) {
    const entries = leaderboard.leaderboard || leaderboard;
    if (Array.isArray(entries)) {
      console.log('  Leaderboard (top 5):');
      entries.slice(0, 5).forEach((p, i) =>
        console.log(`    ${i + 1}. ${p.username || p.display_name || 'Bot'} — ${p.score} pts`),
      );
    }
  }

  // Save to match history (note: battle royale is multiplayer, save as winner if top score)
  if (room.status === 'finished') {
    try {
      const finalLeaderboard = leaderboard?.leaderboard || [];
      const myRank = finalLeaderboard.findIndex((p) => p.userId === MY_USER_ID);
      const isWinner = myRank === 0;

      await api('POST', '/api/match-history', token, {
        player1_id: MY_USER_ID,
        player2_id: null,
        player1_username: 'Player',
        player2_username: `${(room.players?.length ?? 1) - 1} opponents`,
        winner_id: isWinner ? MY_USER_ID : null,
        player1_score: myScore,
        player2_score: finalLeaderboard.length > 1 ? finalLeaderboard[1]?.score ?? 0 : 0,
        match_mode: 'battle_royale',
        game_ref_id: roomId,
        game_ref_type: 'battle_royale',
      });
      console.log('  → Saved battle royale to match history');
    } catch (e) {
      console.log(`  ⚠ Failed to save battle royale: ${e.message}`);
    }
  }

  return { success: room.status === 'finished', roomId };
}

// ─── 3. TWO-PLAYER LOCAL GAME ───────────────────────────────────────
async function simulate2Player() {
  console.log('\n══════════════════════════════════════');
  console.log('  2-PLAYER LOCAL GAME SIMULATION');
  console.log('══════════════════════════════════════');

  console.log('→ Creating 2-player game...');
  const game = await api('POST', '/api/games', null, {
    player1Name: 'TestPlayer1',
    player2Name: 'TestPlayer2',
  });
  const gameId = game.game_id;
  console.log(`  Game created: ${gameId} (questions: ${game.question_count})`);

  let board = await api('GET', `/api/games/${gameId}`, null);
  const cells = board.board.flat().filter((c) => c.question_id && !c.answered);
  console.log(`  Board: ${board.categories?.length || 7} categories, ${cells.length} playable cells`);

  let currentPlayer = 0;
  let answeredCount = 0;
  let errors = [];

  for (const cell of cells) {
    // Re-check board status in case game finished early
    if (answeredCount > 0 && answeredCount % 5 === 0) {
      board = await api('GET', `/api/games/${gameId}`, null);
      if (board.status === 'FINISHED') {
        console.log('  Game finished (early win condition)');
        break;
      }
    }

    // Fetch question
    let question;
    try {
      question = await api('GET', `/api/games/${gameId}/questions/${cell.question_id}`, null);
    } catch (e) {
      console.log(`  Skipping cell (${cell.category}/${cell.difficulty}): ${e.message}`);
      errors.push(e.message);
      continue;
    }

    // Handle TOP_5 questions differently
    if (cell.category === 'TOP_5') {
      console.log(`  Q(${cell.category}/${cell.difficulty}): Top-5 — submitting guesses... [P${currentPlayer + 1}]`);
      for (let g = 0; g < 3; g++) {
        try {
          const res = await api('POST', `/api/games/${gameId}/top5/guess`, null, {
            questionId: cell.question_id,
            answer: `guess_${Math.random().toString(36).slice(2, 6)}`,
            playerIndex: currentPlayer,
            useDouble: false,
          });
          if (res.complete) break;
        } catch {
          break; // 2 wrong guesses closes it
        }
      }
      answeredCount++;
      currentPlayer = currentPlayer === 0 ? 1 : 0;
      await sleep(200);
      continue;
    }

    // Regular question — peek at answer (admin-gated) to simulate varied accuracy
    const questionText = question.question_text || question.question || '';
    const accuracy = currentPlayer === 0 ? P1_ACCURACY : P2_ACCURACY;
    const shouldAnswerCorrectly = Math.random() < accuracy;

    let answer;
    if (shouldAnswerCorrectly) {
      try {
        const peek = await fetch(`${API}/api/games/${gameId}/questions/${cell.question_id}/peek`, {
          headers: { 'x-admin-key': ADMIN_KEY },
        });
        if (!peek.ok) {
          const errText = await peek.text();
          console.log(`    ⚠ Peek failed (${peek.status}), falling back to fuzzy answers`);
          if (peek.status === 401) console.log(`    → Admin key auth failed, check ADMIN_API_KEY env var`);
          // Use common football answers as fuzzy fallbacks
          const fuzzyAnswers = ['Barcelona', 'Real Madrid', 'Manchester United', 'Liverpool', 'Bayern Munich', 'Arsenal', 'Chelsea', 'Messi', 'Ronaldo', 'Guardiola', 'Klopp', '2022', '2021', '2020'];
          answer = fuzzyAnswers[Math.floor(Math.random() * fuzzyAnswers.length)];
        } else {
          const body = await peek.json();
          answer = body.correct_answer || 'random guess';
          if (answer === 'random guess') console.log(`    ℹ Peek returned no correct_answer, using fallback`);
        }
      } catch (e) {
        console.log(`    ⚠ Peek error: ${e.message}, using fuzzy fallback`);
        const fuzzyAnswers = ['Barcelona', 'Real Madrid', 'Manchester United', 'Liverpool', 'Bayern Munich', 'Arsenal', 'Chelsea', 'Messi', 'Ronaldo', 'Guardiola', 'Klopp', '2022', '2021', '2020'];
        answer = fuzzyAnswers[Math.floor(Math.random() * fuzzyAnswers.length)];
      }
    } else {
      // Use a realistic wrong answer
      answer = WRONG_ANSWERS[Math.floor(Math.random() * WRONG_ANSWERS.length)];
    }

    try {
      console.log(`  Q(${cell.category}/${cell.difficulty}): "${questionText.substring(0, 45)}..." → P${currentPlayer + 1}: "${answer.substring(0, 30)}"`);
      const result = await api('POST', `/api/games/${gameId}/answer`, null, {
        questionId: cell.question_id,
        answer,
        playerIndex: currentPlayer,
        useDouble: false,
      });
      answeredCount++;
      console.log(`    correct=${result.correct}, scores=[${result.player_scores}]`);
    } catch (e) {
      if (e.message.includes('FINISHED')) {
        console.log('  Game already finished');
        break;
      }
      console.log(`    Error: ${e.message}`);
      errors.push(e.message);
    }

    currentPlayer = currentPlayer === 0 ? 1 : 0;
    await sleep(250);
  }

  // Check final state, force end if needed
  board = await api('GET', `/api/games/${gameId}`, null);
  if (board.status !== 'FINISHED') {
    console.log('  → Force-ending game...');
    const endResult = await api('POST', `/api/games/${gameId}/end`, null);
    console.log(`  End result: winner=${endResult.winner}, scores=${JSON.stringify(endResult.final_scores)}`);
  }

  board = await api('GET', `/api/games/${gameId}`, null);
  console.log(`\n✓ 2-PLAYER COMPLETE — status: ${board.status}, scores=[${board.players.map((p) => `${p.name}:${p.score}`).join(', ')}]`);
  if (errors.length > 0) console.log(`  ⚠ ${errors.length} errors during game (non-fatal)`);
  return { success: board.status === 'FINISHED', gameId, answered: answeredCount, errors: errors.length };
}

// ─── Save 2-player match to history (requires auth) ─────────────────
async function save2PlayerMatch(token, gameId, board) {
  const p1 = board.players[0];
  const p2 = board.players[1];
  try {
    await api('POST', '/api/match-history', token, {
      player1_id: MY_USER_ID,
      player2_id: null,
      player1_username: p1.name,
      player2_username: p2.name,
      winner_id: p1.score > p2.score ? MY_USER_ID : null,
      player1_score: p1.score,
      player2_score: p2.score,
      match_mode: 'local',
      game_ref_id: gameId,
      game_ref_type: 'local',
    });
    console.log('  → Saved 2-player match to history');
  } catch (e) {
    console.log(`  ⚠ Failed to save match history: ${e.message}`);
  }
}

// ─── 4. SOLO RANKED SESSION (single run) ────────────────────────────
// Simulates the end-to-end solo flow: start → N×(next, answer) → end.
// Accuracy is driven by pickShouldAnswerCorrectly + DB peek of correct_answer.
async function simulateSoloSession(token, { target = SOLO_QUESTIONS, targetAccuracy = TARGET_ACCURACY, label = '' } = {}) {
  const tag = label ? ` [${label}]` : '';
  console.log(`\n── SOLO SESSION${tag} — target=${target}q, accuracy=${(targetAccuracy * 100).toFixed(0)}% ──`);

  const { session_id: sessionId, user_elo: startElo } = await api('POST', '/api/solo/session', token);
  console.log(`  Session ${sessionId.slice(0, 8)}… startElo=${startElo}`);

  let lastCorrect = null;
  let correctSoFar = 0;
  let answered = 0;

  for (let i = 0; i < target; i++) {
    let q;
    try {
      q = await api('GET', `/api/solo/session/${sessionId}/next`, token);
    } catch (e) {
      console.log(`  Q${i}: next failed — ${e.message}`);
      break;
    }

    const shouldBeCorrect = pickShouldAnswerCorrectly({
      questionIndex: i,
      sessionLength: target,
      difficulty: q.difficulty,
      lastCorrect,
      correctSoFar,
      targetAccuracy,
    });

    let answer;
    if (shouldBeCorrect) {
      const peeked = await peekPoolCorrectAnswer(q.question_id);
      if (peeked) {
        answer = peeked;
      } else {
        // LLM-fallback question (id starts with 'solo-') — we can't peek.
        // Fall through to wrong guess; accuracy will skew down slightly.
        answer = WRONG_ANSWERS[Math.floor(Math.random() * WRONG_ANSWERS.length)];
      }
    } else {
      answer = WRONG_ANSWERS[Math.floor(Math.random() * WRONG_ANSWERS.length)];
    }

    // Simulate think time (1.5–3.5s) — above the highest speed-check floor
    // (1500ms for EXPERT) and well under the shortest 12s timer.
    await jitterSleep(1500, 3500);

    try {
      const res = await api('POST', `/api/solo/session/${sessionId}/answer`, token, { answer });
      if (res.rejected_too_fast) {
        // Server clamp fired — wait out the minimum and re-issue the iteration.
        console.log(`  Q${i + 1}: server rejected as too-fast — retrying after a pause`);
        await sleep(800);
        i--;
        continue;
      }
      answered++;
      lastCorrect = !!res.correct;
      if (res.correct) correctSoFar++;
      const flag = res.correct ? '✓' : '✗';
      console.log(`  Q${i + 1}/${target} ${flag} ${q.difficulty.padEnd(6)} elo=${res.elo_after} (${res.elo_change >= 0 ? '+' : ''}${res.elo_change})`);
    } catch (e) {
      console.log(`  Q${i + 1}: answer failed — ${e.message}`);
      // Continue: one failed submit shouldn't kill the session.
    }
  }

  let summary = { questions_answered: answered, correct_answers: correctSoFar, elo_delta: 0 };
  try {
    summary = await api('POST', `/api/solo/session/${sessionId}/end`, token);
  } catch (e) {
    console.log(`  ⚠ endSession failed: ${e.message}`);
  }
  const pct = summary.questions_answered > 0
    ? ((summary.correct_answers / summary.questions_answered) * 100).toFixed(1)
    : '0.0';
  console.log(`  → ${summary.correct_answers}/${summary.questions_answered} correct (${pct}%)  elo Δ ${summary.elo_delta ?? 0}`);
  return { success: summary.questions_answered > 0, ...summary };
}

// ─── 5. LOGO QUIZ SESSION (N questions) ─────────────────────────────
// No session endpoint — logo quiz is one-question-at-a-time. We loop N
// GET /question + POST /answer calls, then POST /check-achievements.
// team_name is in the GET response, so no DB peek needed.
async function simulateLogoQuizSession(token, { target = LOGO_QUESTIONS, targetAccuracy = TARGET_ACCURACY, label = '' } = {}) {
  const tag = label ? ` [${label}]` : '';
  console.log(`\n── LOGO QUIZ${tag} — target=${target}q, accuracy=${(targetAccuracy * 100).toFixed(0)}% ──`);

  let answered = 0;
  let correctSoFar = 0;
  let lastCorrect = null;

  for (let i = 0; i < target; i++) {
    let q;
    try {
      q = await api('GET', '/api/logo-quiz/question', token);
    } catch (e) {
      console.log(`  Q${i + 1}: get question failed — ${e.message}`);
      break;
    }
    const questionId = q.id;
    if (!questionId) {
      console.log(`  Q${i + 1}: malformed question response (no id)`);
      break;
    }

    // Post-hardening, the GET response no longer ships team_name. Peek
    // question_pool.correct_answer via service role — same pattern as solo.
    const peekedAnswer = await peekPoolCorrectAnswer(questionId);

    const shouldBeCorrect = pickShouldAnswerCorrectly({
      questionIndex: i,
      sessionLength: target,
      difficulty: q.difficulty || 'EASY',
      lastCorrect,
      correctSoFar,
      targetAccuracy,
    });

    const answer = shouldBeCorrect && peekedAnswer
      ? peekedAnswer
      : WRONG_ANSWERS[Math.floor(Math.random() * WRONG_ANSWERS.length)];

    // 1.2–3.0s think time — comfortably above the 400/600ms speed-check floor.
    await jitterSleep(1200, 3000);

    try {
      const res = await api('POST', '/api/logo-quiz/answer', token, {
        question_id: questionId,
        answer,
        timed_out: false,
      });
      if (res.rejected_too_fast) {
        // Defensive: shouldn't happen with our jitter but log + retry-like skip.
        console.log(`  Q${i + 1}: server rejected as too-fast — retrying after a pause`);
        await sleep(800);
        i--; // re-issue this iteration
        continue;
      }
      answered++;
      lastCorrect = !!res.correct;
      if (res.correct) correctSoFar++;
      const flag = res.correct ? '✓' : '✗';
      const revealed = res.correct_answer ? res.correct_answer.slice(0, 24) : '?';
      console.log(`  Q${i + 1}/${target} ${flag} ${(q.difficulty || '?').padEnd(6)} "${revealed}" elo=${res.elo_after} (${res.elo_change >= 0 ? '+' : ''}${res.elo_change})`);
    } catch (e) {
      console.log(`  Q${i + 1}: answer failed — ${e.message}`);
    }
  }

  // Fire achievement check (what the frontend calls at session end)
  try {
    await api('POST', '/api/logo-quiz/check-achievements', token, { session_correct: correctSoFar });
  } catch { /* non-fatal */ }

  const pct = answered > 0 ? ((correctSoFar / answered) * 100).toFixed(1) : '0.0';
  console.log(`  → ${correctSoFar}/${answered} correct (${pct}%)`);
  return { success: answered > 0, answered, correct: correctSoFar };
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   E2E Game Flow Simulation               ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const token = await getToken();
  const results = {};

  // 1. Duel
  if (phaseOn('SIM_DUEL')) {
    try {
      results.duel = await simulateDuel(token);
    } catch (e) {
      console.error(`\n✗ DUEL FAILED: ${e.message}`);
      results.duel = { success: false, error: e.message };
    }
  }

  // 2. Battle Royale
  if (phaseOn('SIM_BR')) {
    try {
      results.battleRoyale = await simulateBattleRoyale(token);
    } catch (e) {
      console.error(`\n✗ BATTLE ROYALE FAILED: ${e.message}`);
      results.battleRoyale = { success: false, error: e.message };
    }
  }

  // 3. 2-Player
  if (phaseOn('SIM_2P')) {
    try {
      results.twoPlayer = await simulate2Player();
      // Save to match history so it appears in profile
      if (results.twoPlayer.success) {
        const board = await api('GET', `/api/games/${results.twoPlayer.gameId}`, null);
        await save2PlayerMatch(token, results.twoPlayer.gameId, board);
      }
    } catch (e) {
      console.error(`\n✗ 2-PLAYER FAILED: ${e.message}`);
      results.twoPlayer = { success: false, error: e.message };
    }
  }

  // 4. N × Solo ranked sessions (short)
  if (phaseOn('SIM_SOLO')) {
    console.log('\n══════════════════════════════════════');
    console.log(`  SOLO RANKED — ${SOLO_SESSIONS} × ${SOLO_QUESTIONS}q @ ${(TARGET_ACCURACY * 100).toFixed(0)}%`);
    console.log('══════════════════════════════════════');
    const soloRuns = [];
    for (let i = 0; i < SOLO_SESSIONS; i++) {
      try {
        const r = await simulateSoloSession(token, { label: `${i + 1}/${SOLO_SESSIONS}` });
        soloRuns.push(r);
      } catch (e) {
        console.error(`✗ SOLO SESSION ${i + 1} FAILED: ${e.message}`);
        soloRuns.push({ success: false, error: e.message });
      }
      await sleep(1000); // breathing room between sessions
    }
    const totals = soloRuns.reduce(
      (acc, r) => ({
        answered: acc.answered + (r.questions_answered ?? 0),
        correct: acc.correct + (r.correct_answers ?? 0),
      }),
      { answered: 0, correct: 0 },
    );
    results.solo = {
      success: soloRuns.every((r) => r.success),
      runs: soloRuns.length,
      ...totals,
    };
  }

  // 5. N × Logo Quiz sessions
  if (phaseOn('SIM_LOGO')) {
    console.log('\n══════════════════════════════════════');
    console.log(`  LOGO QUIZ — ${LOGO_SESSIONS} × ${LOGO_QUESTIONS}q @ ${(TARGET_ACCURACY * 100).toFixed(0)}%`);
    console.log('══════════════════════════════════════');
    const logoRuns = [];
    for (let i = 0; i < LOGO_SESSIONS; i++) {
      try {
        const r = await simulateLogoQuizSession(token, { label: `${i + 1}/${LOGO_SESSIONS}` });
        logoRuns.push(r);
      } catch (e) {
        console.error(`✗ LOGO SESSION ${i + 1} FAILED: ${e.message}`);
        logoRuns.push({ success: false, error: e.message });
      }
      await sleep(1000);
    }
    const totals = logoRuns.reduce(
      (acc, r) => ({
        answered: acc.answered + (r.answered ?? 0),
        correct: acc.correct + (r.correct ?? 0),
      }),
      { answered: 0, correct: 0 },
    );
    results.logoQuiz = {
      success: logoRuns.every((r) => r.success),
      runs: logoRuns.length,
      ...totals,
    };
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║            RESULTS SUMMARY               ║');
  console.log('╠══════════════════════════════════════════╣');
  for (const [mode, result] of Object.entries(results)) {
    const icon = result.success ? '✓' : '✗';
    const detail = result.error ? ` (${result.error.substring(0, 50)})` : '';
    console.log(`║  ${icon} ${mode.padEnd(18)} ${result.success ? 'PASSED' : 'FAILED'}${detail}`);
  }
  console.log('╚══════════════════════════════════════════╝');

  const allPassed = Object.values(results).every((r) => r.success);
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
