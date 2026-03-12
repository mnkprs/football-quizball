#!/usr/bin/env npx ts-node
/**
 * Fetches question_pool raw_score data and generates an HTML heatmap.
 * Run: npm run db:heatmap (from backend/)
 * Output: ../docs/raw-score-heatmap-db.html
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { fetchAllRows } from './utils/fetch-all-rows';
import * as fs from 'fs';
import * as path from 'path';

interface PoolRow {
  category: string;
  difficulty: string;
  raw_score: number | null;
}

interface SlotStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  std: number;
  withRaw: number;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function toHeatColor(value: number): string {
  // 0 = green (easy), 0.5 = yellow, 1 = red (hard)
  const r = Math.round(Math.min(255, value * 510));
  const g = Math.round(Math.min(255, (1 - value) * 255));
  const b = 50;
  return `rgb(${r},${g},${b})`;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);

  const rows = await fetchAllRows<PoolRow>(
    supabase.client,
    'question_pool',
    'category, difficulty, raw_score',
  );

  await app.close();

  const categories = [...new Set(rows.map((r) => r.category))].sort();
  const difficulties = ['EASY', 'MEDIUM', 'HARD'];

  const slotStats: Record<string, SlotStats> = {};
  const rawValues: number[] = [];
  const bucketCounts: Record<string, number> = {};
  const BUCKETS = 25;
  for (let i = 0; i < BUCKETS; i++) {
    bucketCounts[`${i}`] = 0;
  }

  for (const row of rows) {
    const key = `${row.category}/${row.difficulty}`;
    if (!slotStats[key]) {
      slotStats[key] = { count: 0, avg: 0, min: 1, max: 0, std: 0, withRaw: 0 };
    }
    slotStats[key].count += 1;

    if (row.raw_score != null && !Number.isNaN(row.raw_score)) {
      rawValues.push(row.raw_score);
      slotStats[key].withRaw += 1;
      const bucket = Math.min(
        BUCKETS - 1,
        Math.floor(row.raw_score * BUCKETS),
      );
      bucketCounts[`${bucket}`] = (bucketCounts[`${bucket}`] ?? 0) + 1;
    }
  }

  for (const key of Object.keys(slotStats)) {
    const slot = slotStats[key];
    const values = rows
      .filter((r) => `${r.category}/${r.difficulty}` === key && r.raw_score != null)
      .map((r) => r.raw_score as number);
    if (values.length > 0) {
      slot.avg = values.reduce((a, b) => a + b, 0) / values.length;
      slot.min = Math.min(...values);
      slot.max = Math.max(...values);
      slot.std = stdDev(values);
    }
  }

  const overallAvg =
    rawValues.length > 0
      ? rawValues.reduce((a, b) => a + b, 0) / rawValues.length
      : 0;
  const overallStd = stdDev(rawValues);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raw Score Heatmap — question_pool</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Space Grotesk', sans-serif; background: #0f0f12; color: #e4e4e7; min-height: 100vh; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: #fafafa; }
    .subtitle { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #71717a; margin-bottom: 1rem; }
    .summary { display: flex; gap: 2rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .summary-card { background: #18181b; border-radius: 8px; padding: 1rem 1.5rem; border: 1px solid #27272a; }
    .summary-card .label { font-size: 0.75rem; color: #71717a; }
    .summary-card .value { font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; }
    .heatmap-container { background: #18181b; border-radius: 12px; padding: 2rem; border: 1px solid #27272a; margin-bottom: 2rem; }
    .heatmap-title { font-size: 1rem; margin-bottom: 1rem; color: #a1a1aa; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #27272a; }
    th { font-size: 0.75rem; color: #71717a; font-weight: 500; text-transform: uppercase; }
    td.cell-avg { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; }
    td.cell-count { font-size: 0.85rem; color: #a1a1aa; }
    .heat-cell { width: 80px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; font-weight: 600; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    .histogram-wrap { position: relative; }
    .histogram { display: flex; align-items: flex-end; gap: 2px; height: 140px; margin-top: 1rem; }
    .hist-bar { flex: 1; min-width: 8px; background: linear-gradient(to top, #22c55e, #eab308, #ef4444); border-radius: 2px 2px 0 0; transition: opacity 0.15s; }
    .hist-bar:hover { opacity: 0.85; }
    .hist-labels { display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: #71717a; margin-top: 0.5rem; }
    .hist-threshold { position: absolute; top: 0; bottom: 24px; width: 2px; background: rgba(255,255,255,0.6); transform: translateX(-50%); }
    .hist-threshold::after { content: attr(data-val); position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 0.65rem; color: #a1a1aa; }
  </style>
</head>
<body>
  <h1>Raw Score Heatmap — question_pool</h1>
  <p class="subtitle">Generated from ${rows.length} rows · ${rawValues.length} with raw_score</p>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Total questions</div>
      <div class="value">${rows.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">With raw_score</div>
      <div class="value">${rawValues.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Overall avg raw</div>
      <div class="value">${overallAvg.toFixed(3)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Overall std</div>
      <div class="value">${overallStd.toFixed(3)}</div>
    </div>
  </div>

  <div class="heatmap-container">
    <div class="heatmap-title">Avg raw score by category × difficulty (color = difficulty)</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          ${difficulties.map((d) => `<th>${d}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${categories
          .map(
            (cat) => `
        <tr>
          <td>${cat}</td>
          ${difficulties
            .map((diff) => {
              const key = `${cat}/${diff}`;
              const s = slotStats[key];
              if (!s || s.count === 0) return '<td>—</td>';
              const avg = s.withRaw > 0 ? s.avg : null;
              const color = avg != null ? toHeatColor(avg) : '#27272a';
              const rawNote = s.withRaw < s.count ? ` (${s.withRaw} w/raw)` : '';
              return `<td>
                <div class="heat-cell" style="background:${color}">${avg != null ? avg.toFixed(2) : '—'}</div>
                <div class="cell-count">n=${s.count}${rawNote}</div>
              </td>`;
            })
            .join('')}
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <div class="heatmap-container">
    <div class="heatmap-title">Spread (min / max / std) by slot</div>
    <table>
      <thead>
        <tr>
          <th>Slot</th>
          <th>Count</th>
          <th>Avg</th>
          <th>Min</th>
          <th>Max</th>
          <th>Std</th>
        </tr>
      </thead>
      <tbody>
        ${categories
          .flatMap((cat) =>
            difficulties.map((diff) => {
              const key = `${cat}/${diff}`;
              const s = slotStats[key];
              if (!s || s.count === 0) return '';
              return `
        <tr>
          <td>${cat}/${diff}</td>
          <td>${s.count}</td>
          <td class="cell-avg">${s.withRaw > 0 ? s.avg.toFixed(3) : '—'}</td>
          <td class="cell-avg">${s.withRaw > 0 ? s.min.toFixed(3) : '—'}</td>
          <td class="cell-avg">${s.withRaw > 0 ? s.max.toFixed(3) : '—'}</td>
          <td class="cell-avg">${s.withRaw > 0 ? s.std.toFixed(3) : '—'}</td>
        </tr>`;
            }),
          )
          .filter(Boolean)
          .join('')}
      </tbody>
    </table>
  </div>

  <div class="heatmap-container">
    <div class="heatmap-title">Raw score distribution (${BUCKETS} buckets, 0.04 width each) · Thresholds: 0.36 (EASY|MEDIUM), 0.55 (MEDIUM|HARD)</div>
    <div class="histogram-wrap">
      <div class="hist-threshold" style="left: 36%;" data-val="0.36"></div>
      <div class="hist-threshold" style="left: 55%;" data-val="0.55"></div>
      <div class="histogram" id="histogram"></div>
    </div>
    <div class="hist-labels">
      <span>0</span>
      <span>0.2</span>
      <span>0.4</span>
      <span>0.6</span>
      <span>0.8</span>
      <span>1.0</span>
    </div>
  </div>

  <script>
    const bucketCounts = ${JSON.stringify(bucketCounts)};
    const BUCKETS = ${BUCKETS};
    const maxCount = Math.max(...Object.values(bucketCounts), 1);
    const hist = document.getElementById('histogram');
    for (let i = 0; i < BUCKETS; i++) {
      const h = ((bucketCounts[i] || 0) / maxCount) * 100;
      const lo = (i / BUCKETS).toFixed(2);
      const hi = ((i + 1) / BUCKETS).toFixed(2);
      const bar = document.createElement('div');
      bar.className = 'hist-bar';
      bar.style.height = h + '%';
      bar.title = '[' + lo + '-' + hi + '): ' + (bucketCounts[i] || 0);
      hist.appendChild(bar);
    }
    function toHeatColor(value) {
      const r = Math.round(Math.min(255, value * 510));
      const g = Math.round(Math.min(255, (1 - value) * 255));
      return 'rgb(' + r + ',' + g + ',50)';
    }
  </script>
</body>
</html>`;

  const outPath = path.join(__dirname, '../../docs/raw-score-heatmap-db.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
