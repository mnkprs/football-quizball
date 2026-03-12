#!/usr/bin/env node
/**
 * Seed the question pool via the admin API.
 * Usage: npm run seed-pool -- 50  (or npm run seed-pool --50)
 * Example: npm run seed-pool -- 100
 */
function parseTargetArg() {
  const raw = (process.argv[2] || '100').replace(/^--/, '');
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 100 : Math.min(500, Math.max(1, n));
}
const target = parseTargetArg();
const baseUrl = process.env.API_URL || 'http://localhost:3001';

async function main() {
  console.log(`Seeding pool to ${target} questions per slot (${baseUrl})...`);
  const res = await fetch(`${baseUrl}/api/admin/seed-pool?target=${target}`, {
    method: 'POST',
  });
  if (!res.ok) {
    console.error(`Error: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = await res.json();
  console.log(`Done. Total added: ${data.totalAdded} (generation version: ${data.generationVersion ?? 'n/a'})`);
  data.results.forEach((r) => {
    if (r.added > 0) {
      console.log(`  ${r.slot}: +${r.added}`);
      (r.questions || []).forEach((q) => console.log(`    → ${q}`));
    }
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
