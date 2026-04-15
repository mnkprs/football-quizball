#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Interactive review UI for the canonical entity list.
 *
 * Flags:
 *   1. Invalid types (not in allowed enum) — default to DELETE
 *   2. Likely duplicate pairs — choose keep-A / keep-B / keep-both
 *   3. Top-N per type — read-only sanity scan
 *
 * You make choices in the browser. State persists in localStorage so you can
 * stop and come back. When done, click "Download cleaned JSON" and save it
 * as canonical-entities.cleaned.json next to the source file.
 *
 * Run:  npm run pool:review-entities
 * Open: backend/scripts/_backfill-pool/canonical-entities.review.html
 */
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_TYPES = ['player', 'team', 'league', 'trophy', 'manager', 'stadium', 'country'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

const IN_FILE = path.resolve(__dirname, '_backfill-pool', 'canonical-entities.json');
const OUT_FILE = path.resolve(__dirname, '_backfill-pool', 'canonical-entities.review.html');

interface Entity {
  type: string;
  slug: string;
  display_name: string;
  aliases: string[];
  mention_count: number;
  sample_question_ids: string[];
}

interface Source {
  generated_at: string;
  source: Record<string, unknown>;
  counts_by_type: Record<string, number>;
  entities: Entity[];
}

interface DupePair {
  a_id: number;
  b_id: number;
  reason: string;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findDupes(entities: Entity[]): DupePair[] {
  const byType = new Map<string, Array<{ idx: number; e: Entity }>>();
  entities.forEach((e, idx) => {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push({ idx, e });
  });

  const pairs: DupePair[] = [];
  for (const [, list] of byType) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        const an = normalise(A.e.display_name), bn = normalise(B.e.display_name);

        if (an === bn) {
          pairs.push({ a_id: A.idx, b_id: B.idx, reason: 'same normalised display_name' });
          continue;
        }

        const dist = levenshtein(A.e.slug, B.e.slug);
        const maxLen = Math.max(A.e.slug.length, B.e.slug.length);
        if (dist > 0 && dist <= 2 && maxLen >= 6) {
          pairs.push({ a_id: A.idx, b_id: B.idx, reason: `slug Levenshtein=${dist}` });
          continue;
        }

        const aNames = [A.e.display_name, ...A.e.aliases].map(normalise);
        const bNames = [B.e.display_name, ...B.e.aliases].map(normalise);
        const overlap = aNames.filter((n) => bNames.includes(n));
        if (overlap.length > 0) {
          pairs.push({ a_id: A.idx, b_id: B.idx, reason: `shared alias "${overlap[0]}"` });
        }
      }
    }
  }
  return pairs;
}

function renderHtml(src: Source, dupes: DupePair[], invalidIds: number[], topByType: Map<string, Entity[]>): string {
  const payload = {
    generated_at: src.generated_at,
    counts_by_type: src.counts_by_type,
    entities: src.entities,
    dupes,
    invalid_ids: invalidIds,
    allowed_types: ALLOWED_TYPES as unknown as string[],
    storage_key: 'canonical-entities-review-v1',
  };

  const topByTypeMap: Record<string, number[]> = {};
  for (const [t, list] of topByType) {
    topByTypeMap[t] = list.map((e) => src.entities.indexOf(e));
  }
  (payload as Record<string, unknown>).top_by_type = topByTypeMap;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Canonical entities — review</title>
<style>
  :root { --bg:#fafafa; --card:#fff; --line:#e5e7eb; --muted:#6b7280; --accent:#2563eb; --warn:#f59e0b; --danger:#dc2626; --ok:#059669; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; color: #111; background: var(--bg); }
  header { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid var(--line); padding: .75rem 1.25rem; display: flex; align-items: center; gap: 1rem; }
  header h1 { font-size: 1rem; margin: 0; flex: 1; }
  header button { font: inherit; padding: .4rem .8rem; border: 1px solid var(--line); background: #fff; border-radius: 6px; cursor: pointer; }
  header button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  header button.primary:hover { background: #1d4ed8; }
  header button:hover { background: #f3f4f6; }
  main { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1.25rem 6rem; }
  h2 { margin-top: 2.5rem; padding-bottom: .4rem; border-bottom: 1px solid var(--line); font-size: 1.1rem; }
  h3 { margin-top: 1.5rem; font-size: .95rem; }
  .summary { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 1rem 1.25rem; }
  .summary ul { margin: .4rem 0 0 0; padding-left: 1.25rem; }
  .dim { color: var(--muted); font-weight: normal; }
  .pair { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .85rem 1rem; margin-bottom: .6rem; }
  .pair.resolved { opacity: .55; }
  .pair-head { display: flex; justify-content: space-between; align-items: center; font-size: .75rem; text-transform: uppercase; color: var(--warn); letter-spacing: .5px; margin-bottom: .5rem; }
  .pair-head .status { color: var(--muted); }
  .pair-body { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
  .choice { border: 2px solid var(--line); border-radius: 6px; padding: .55rem .75rem; cursor: pointer; transition: background .1s, border-color .1s; position: relative; }
  .choice:hover { background: #f9fafb; }
  .choice.sel { border-color: var(--accent); background: #eff6ff; }
  .choice .slug { font-family: ui-monospace, Menlo, monospace; font-size: .82em; background: #f1f5f9; padding: 1px 6px; border-radius: 3px; display: inline-block; }
  .choice .name { font-weight: 600; margin-top: .25rem; }
  .choice .meta { color: var(--muted); font-size: .8em; margin-top: .15rem; }
  .choice .aliases { color: #94a3b8; font-size: .78em; font-style: italic; margin-top: .2rem; }
  .pair-actions { display: flex; gap: .5rem; margin-top: .55rem; }
  .pair-actions button { font: inherit; border: 1px solid var(--line); background: #fff; padding: .25rem .6rem; border-radius: 4px; cursor: pointer; font-size: .85em; }
  .pair-actions button.sel { border-color: var(--accent); color: var(--accent); background: #eff6ff; font-weight: 600; }
  table.top { width: 100%; border-collapse: collapse; margin-top: .5rem; background: var(--card); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  table.top th, table.top td { padding: .35rem .75rem; border-bottom: 1px solid var(--line); text-align: left; }
  table.top th { background: #f3f4f6; font-weight: 600; font-size: .85em; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; color: #475569; width: 80px; }
  code { font-family: ui-monospace, Menlo, monospace; background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-size: .88em; }
  .invalid-row label { display: flex; align-items: center; gap: .6rem; padding: .5rem .75rem; background: var(--card); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; margin-bottom: .3rem; }
  .invalid-row label.kept { border-color: var(--ok); background: #ecfdf5; }
  .invalid-row input { margin: 0; }
  .invalid-row select { font: inherit; padding: .2rem .4rem; }
  .filter-bar { margin: 1rem 0 .5rem; }
  .filter-bar button { font: inherit; padding: .25rem .6rem; border: 1px solid var(--line); background: #fff; border-radius: 4px; cursor: pointer; font-size: .85em; margin-right: .3rem; }
  .filter-bar button.active { background: #111; color: #fff; border-color: #111; }
  footer-bar { position: fixed; bottom: 1rem; right: 1rem; background: var(--accent); color: #fff; padding: .6rem 1rem; border-radius: 6px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
</style></head>
<body>
<header>
  <h1>Canonical entities — review</h1>
  <span id="progress" class="dim">0/0 resolved</span>
  <button onclick="resetAll()">Reset</button>
  <button class="primary" onclick="downloadCleaned()">Download cleaned JSON</button>
</header>

<main>
  <div class="summary" id="summary"></div>

  <h2>1. Invalid types <span class="dim">(must remove — or reassign to a valid type)</span></h2>
  <div id="invalid-section"></div>

  <h2>2. Duplicate pairs <span class="dim">(pick which to keep; loser's aliases + mention_count merge into winner)</span></h2>
  <div class="filter-bar">
    <strong>Filter:</strong>
    <button data-filter="all" class="active">All</button>
    <button data-filter="unresolved">Unresolved only</button>
    <button data-filter="resolved">Resolved only</button>
  </div>
  <div id="dupes-section"></div>

  <h2>3. Top 30 per type <span class="dim">(read-only sanity scan)</span></h2>
  <div id="top-section"></div>
</main>

<script id="payload" type="application/json">${JSON.stringify(payload)}</script>
<script>
(function () {
  const DATA = JSON.parse(document.getElementById('payload').textContent);
  const STORAGE = DATA.storage_key;
  const ENTITIES = DATA.entities;

  // State shape:
  //   dupes: { "<pair_index>": "a" | "b" | "both" }
  //   invalid: { "<entity_index>": "delete" | "<valid_type>" }
  const saved = loadState();
  const state = {
    dupes: saved.dupes || {},
    invalid: saved.invalid || {},
    filter: 'all',
  };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE) || '{}'); }
    catch { return {}; }
  }
  function saveState() {
    localStorage.setItem(STORAGE, JSON.stringify({ dupes: state.dupes, invalid: state.invalid }));
    updateProgress();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function renderEntity(e) {
    const aliases = e.aliases.length ? '<div class="aliases">aka: ' + esc(e.aliases.join(', ')) + '</div>' : '';
    return '<span class="slug">' + esc(e.slug) + '</span>' +
           '<div class="name">' + esc(e.display_name) + '</div>' +
           '<div class="meta">' + e.mention_count + ' mention' + (e.mention_count === 1 ? '' : 's') + ' · ' + esc(e.type) + '</div>' +
           aliases;
  }

  function renderSummary() {
    const total = ENTITIES.length;
    const dupes = DATA.dupes.length;
    const invalid = DATA.invalid_ids.length;
    const byType = DATA.counts_by_type;
    const typeRows = Object.entries(byType).sort().map(([t, c]) => {
      const bad = DATA.allowed_types.includes(t) ? '' : ' <strong style="color:var(--danger)">(invalid)</strong>';
      return '<li><code>' + esc(t) + '</code> — ' + c + bad + '</li>';
    }).join('');
    document.getElementById('summary').innerHTML =
      '<div><strong>Generated:</strong> ' + esc(DATA.generated_at) + '</div>' +
      '<div><strong>Total entities:</strong> ' + total + '</div>' +
      '<div><strong>Flags:</strong> ' + invalid + ' invalid · ' + dupes + ' dupe pairs</div>' +
      '<div><strong>By type:</strong><ul>' + typeRows + '</ul></div>';
  }

  function renderInvalid() {
    const container = document.getElementById('invalid-section');
    if (DATA.invalid_ids.length === 0) {
      container.innerHTML = '<p style="color:var(--ok)">No invalid types.</p>';
      return;
    }
    container.innerHTML = DATA.invalid_ids.map((id) => {
      const e = ENTITIES[id];
      const choice = state.invalid[id] || 'delete';
      const typeOptions = DATA.allowed_types.map((t) => '<option value="' + t + '"' + (choice === t ? ' selected' : '') + '>' + t + '</option>').join('');
      return '<div class="invalid-row"><label class="' + (choice !== 'delete' ? 'kept' : '') + '">' +
        '<input type="checkbox" data-id="' + id + '" ' + (choice !== 'delete' ? 'checked' : '') + '>' +
        '<span style="flex:1"><code>' + esc(e.type) + '</code> → <code>' + esc(e.slug) + '</code> · ' + esc(e.display_name) + ' (' + e.mention_count + ' mentions)</span>' +
        '<span class="dim">keep as:</span> <select data-id="' + id + '" ' + (choice === 'delete' ? 'disabled' : '') + '>' + typeOptions + '</select>' +
        '</label></div>';
    }).join('');
    container.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', (ev) => {
        const id = ev.target.dataset.id;
        const sel = container.querySelector('select[data-id="' + id + '"]');
        if (ev.target.checked) {
          state.invalid[id] = sel.value;
          sel.disabled = false;
        } else {
          state.invalid[id] = 'delete';
          sel.disabled = true;
        }
        saveState(); renderInvalid();
      });
    });
    container.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', (ev) => {
        const id = ev.target.dataset.id;
        state.invalid[id] = ev.target.value;
        saveState(); renderInvalid();
      });
    });
  }

  function renderDupes() {
    const container = document.getElementById('dupes-section');
    if (DATA.dupes.length === 0) {
      container.innerHTML = '<p style="color:var(--ok)">No duplicates detected.</p>';
      return;
    }
    const html = DATA.dupes.map((p, idx) => {
      const a = ENTITIES[p.a_id], b = ENTITIES[p.b_id];
      const choice = state.dupes[idx];
      const resolved = !!choice;
      if (state.filter === 'unresolved' && resolved) return '';
      if (state.filter === 'resolved' && !resolved) return '';
      const status = choice ? 'resolved — ' + (choice === 'both' ? 'kept both' : 'keep ' + choice.toUpperCase()) : 'unresolved';
      return '<div class="pair ' + (resolved ? 'resolved' : '') + '" data-idx="' + idx + '">' +
        '<div class="pair-head"><span>' + esc(p.reason) + '</span><span class="status">' + status + '</span></div>' +
        '<div class="pair-body">' +
          '<div class="choice ' + (choice === 'a' ? 'sel' : '') + '" data-pick="a">' + renderEntity(a) + '</div>' +
          '<div class="choice ' + (choice === 'b' ? 'sel' : '') + '" data-pick="b">' + renderEntity(b) + '</div>' +
        '</div>' +
        '<div class="pair-actions">' +
          '<button data-pick="a" class="' + (choice === 'a' ? 'sel' : '') + '">Keep A</button>' +
          '<button data-pick="b" class="' + (choice === 'b' ? 'sel' : '') + '">Keep B</button>' +
          '<button data-pick="both" class="' + (choice === 'both' ? 'sel' : '') + '">Keep both (not a dupe)</button>' +
          '<button data-pick="clear">Clear</button>' +
        '</div>' +
      '</div>';
    }).join('');
    container.innerHTML = html;

    container.querySelectorAll('.pair').forEach((el) => {
      const idx = el.dataset.idx;
      el.querySelectorAll('[data-pick]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const pick = btn.dataset.pick;
          if (pick === 'clear') delete state.dupes[idx];
          else state.dupes[idx] = pick;
          saveState(); renderDupes();
        });
      });
    });
  }

  function renderTop() {
    const c = document.getElementById('top-section');
    const types = Object.keys(DATA.top_by_type).sort();
    c.innerHTML = types.map((t) => {
      const ids = DATA.top_by_type[t];
      const rows = ids.map((id) => {
        const e = ENTITIES[id];
        return '<tr><td class="n">' + e.mention_count + '</td><td><code>' + esc(e.slug) + '</code></td><td>' + esc(e.display_name) + '</td><td class="dim">' + esc(e.aliases.join(', ')) + '</td></tr>';
      }).join('');
      return '<h3>' + esc(t) + ' <span class="dim">(' + (DATA.counts_by_type[t] || 0) + ' total)</span></h3>' +
        '<table class="top"><thead><tr><th>Mentions</th><th>Slug</th><th>Display name</th><th>Aliases</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }).join('');
  }

  function updateProgress() {
    const invalidResolved = DATA.invalid_ids.length;
    const dupesResolved = Object.keys(state.dupes).length;
    const total = DATA.invalid_ids.length + DATA.dupes.length;
    const resolved = invalidResolved + dupesResolved;
    document.getElementById('progress').textContent = resolved + '/' + total + ' resolved';
  }

  document.querySelectorAll('.filter-bar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-bar button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderDupes();
    });
  });

  window.resetAll = function () {
    if (!confirm('Reset all choices?')) return;
    state.dupes = {}; state.invalid = {};
    localStorage.removeItem(STORAGE);
    renderInvalid(); renderDupes(); updateProgress();
  };

  window.downloadCleaned = function () {
    // Build cleaned entity list.
    // 1. Reassign invalid types (or drop).
    // 2. Merge dupes: winner inherits loser's aliases + mention_count + sample_question_ids.
    const dropIds = new Set();
    const typeOverrides = {};
    DATA.invalid_ids.forEach((id) => {
      const choice = state.invalid[id] || 'delete';
      if (choice === 'delete') dropIds.add(id);
      else typeOverrides[id] = choice;
    });

    const mergeInto = {}; // loser_id -> winner_id
    DATA.dupes.forEach((p, idx) => {
      const c = state.dupes[idx];
      if (c === 'a') mergeInto[p.b_id] = p.a_id;
      else if (c === 'b') mergeInto[p.a_id] = p.b_id;
      // 'both' or undefined -> skip
    });

    // Resolve transitive merges (a→b, b→c ⇒ a→c)
    for (const loser in mergeInto) {
      let target = mergeInto[loser];
      const seen = new Set([Number(loser)]);
      while (mergeInto[target] !== undefined && !seen.has(target)) {
        seen.add(target);
        target = mergeInto[target];
      }
      mergeInto[loser] = target;
    }

    const cleaned = [];
    const winnerMap = new Map(); // winner_id -> new entity
    ENTITIES.forEach((e, id) => {
      if (dropIds.has(id)) return;
      if (mergeInto[id] !== undefined) return; // handled as loser below
      const newE = { ...e, aliases: [...e.aliases], sample_question_ids: [...e.sample_question_ids] };
      if (typeOverrides[id]) newE.type = typeOverrides[id];
      cleaned.push(newE);
      winnerMap.set(id, newE);
    });
    // Apply merges.
    ENTITIES.forEach((e, id) => {
      if (mergeInto[id] === undefined) return;
      const winner = winnerMap.get(mergeInto[id]);
      if (!winner) return;
      winner.mention_count += e.mention_count;
      // Add loser's display_name + aliases to winner's aliases.
      const existing = new Set([winner.display_name, ...winner.aliases]);
      if (!existing.has(e.display_name)) winner.aliases.push(e.display_name);
      e.aliases.forEach((a) => { if (!existing.has(a)) winner.aliases.push(a); });
      // Union sample IDs up to 5.
      const sampleSet = new Set(winner.sample_question_ids);
      e.sample_question_ids.forEach((sid) => { if (sampleSet.size < 5) sampleSet.add(sid); });
      winner.sample_question_ids = Array.from(sampleSet);
    });

    cleaned.sort((a, b) => b.mention_count - a.mention_count);
    const countsByType = {};
    cleaned.forEach((e) => { countsByType[e.type] = (countsByType[e.type] || 0) + 1; });

    const out = {
      generated_at: DATA.generated_at,
      reviewed_at: new Date().toISOString(),
      source: { cleaned_from: 'canonical-entities.json', decisions: { dupes_resolved: Object.keys(state.dupes).length, invalid_handled: DATA.invalid_ids.length } },
      counts_by_type: countsByType,
      entities: cleaned,
    };

    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canonical-entities.cleaned.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  renderSummary(); renderInvalid(); renderDupes(); renderTop(); updateProgress();
})();
</script>
</body></html>`;
}

function main(): void {
  if (!fs.existsSync(IN_FILE)) {
    console.error('Missing ' + IN_FILE + '. Run pool:extract-entities first.');
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(IN_FILE, 'utf8')) as Source;

  const invalidIds = src.entities
    .map((e, i) => (ALLOWED_TYPES.includes(e.type as AllowedType) ? -1 : i))
    .filter((i) => i >= 0);

  const validEntities = src.entities.filter((e) => ALLOWED_TYPES.includes(e.type as AllowedType));
  const dupesOnValid = findDupes(validEntities);

  // Remap dupe indices (which are relative to validEntities) back to full ENTITIES array.
  const validIdxToFullIdx: number[] = [];
  src.entities.forEach((e, i) => {
    if (ALLOWED_TYPES.includes(e.type as AllowedType)) validIdxToFullIdx.push(i);
  });
  const dupes: DupePair[] = dupesOnValid.map((p) => ({
    a_id: validIdxToFullIdx[p.a_id],
    b_id: validIdxToFullIdx[p.b_id],
    reason: p.reason,
  }));

  const topByType = new Map<string, Entity[]>();
  for (const e of validEntities) {
    if (!topByType.has(e.type)) topByType.set(e.type, []);
    topByType.get(e.type)!.push(e);
  }
  for (const [t, list] of topByType) {
    topByType.set(t, list.sort((a, b) => b.mention_count - a.mention_count).slice(0, 30));
  }

  const html = renderHtml(src, dupes, invalidIds, topByType);
  fs.writeFileSync(OUT_FILE, html, 'utf8');

  console.log('Interactive review report written to:\n  ' + OUT_FILE);
  console.log('\nSummary:');
  console.log('  invalid-type rows : ' + invalidIds.length);
  console.log('  likely dupe pairs : ' + dupes.length);
  console.log('  total entities    : ' + src.entities.length);
  console.log('\nOpen the HTML, make your choices (saved in localStorage as you go),');
  console.log('then click "Download cleaned JSON" at the top. Save it next to the source.');
}

main();
