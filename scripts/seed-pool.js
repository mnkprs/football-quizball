#!/usr/bin/env node
/* eslint-env node */
/**
 * Seed the question pool via the admin API, then run integrity verification on the generated questions.
 * Usage: npm run seed-pool -- 50  (or npm run seed-pool --50)
 * Example: npm run seed-pool -- 100
 *
 * Requires backend running and ADMIN_API_KEY set. ENABLE_INTEGRITY_VERIFICATION=true for verify step.
 */
function parseTargetArg() {
  const raw = (process.argv[2] || '100').replace(/^--/, '');
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 100 : Math.min(500, Math.max(1, n));
}
const target = parseTargetArg();
const baseUrl = process.env.API_URL || 'http://localhost:3001';
const adminKey = process.env.ADMIN_API_KEY;

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (adminKey) h['x-admin-key'] = adminKey;
  return h;
}

async function main() {
  console.log(`Seeding pool to ${target} questions per slot (${baseUrl})...`);
  const res = await fetch(`${baseUrl}/api/admin/seed-pool?target=${target}`, {
    method: 'POST',
    headers: headers(),
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

  if (data.questionIds?.length > 0) {
    console.log(`\nVerifying integrity of ${data.questionIds.length} generated questions...`);
    const verifyRes = await fetch(`${baseUrl}/api/admin/verify-pool-integrity?apply=true`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ questionIds: data.questionIds }),
    });
    if (!verifyRes.ok) {
      console.error(`Verify error: ${verifyRes.status} ${verifyRes.statusText}`);
      process.exit(1);
    }
    const verifyData = await verifyRes.json();
    console.log(
      `Verify complete: scanned=${verifyData.scanned} fixed=${verifyData.fixed} failed=${verifyData.failed} deleted=${verifyData.deleted}`,
    );
    if (verifyData.corrections?.length) {
      verifyData.corrections.forEach((c) =>
        console.log(`  Fix: ${c.id} [${(c.fields || []).join(', ')}] "${c.from}" → "${c.to}"`),
      );
    }
    if (verifyData.failures?.length) {
      verifyData.failures.forEach((f) => console.log(`  Failed: ${f.id} — ${f.reason}`));
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
