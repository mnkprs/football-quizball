#!/usr/bin/env node
/**
 * Seed the question pool via the admin API.
 * Usage: npm run seed-pool -- [target]
 * Example: npm run seed-pool -- 100
 */
const target = Math.min(500, Math.max(1, parseInt(process.argv[2] || '100', 10)));
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
  console.log(`Done. Total added: ${data.totalAdded}`);
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
