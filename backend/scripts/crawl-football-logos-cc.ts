#!/usr/bin/env bun
/**
 * Crawl https://football-logos.cc — pull new logos not yet in footy-logos.json.
 *
 * Strategy:
 *   1. Fetch /ac.json (single-file index of all 2813 logos).
 *   2. Keep only entries whose categoryId has > MIN_PER_COUNTRY entries.
 *   3. Skip non-country categories (tournaments, etc.) via CATEGORY_BLOCKLIST.
 *   4. Dedupe against slugs already present in footy-logos.json.
 *   5. Download the 700x700 PNG for each new logo into DOWNLOAD_DIR.
 *   6. Emit new-logos.json mirroring the footy-logos.json team shape, so it can
 *      flow straight into the existing Vertex erasure pipeline after manual review.
 *
 * Image URL pattern (reverse-engineered from the site):
 *   https://assets.football-logos.cc/logos/{categoryId}/{size}x{size}/{id}.{slotHash}.png
 *   The 72-char `h` is a concatenation of 8-char slot hashes, one per variant.
 *   Slot index = position in entry.png[] (descending dimension). Tail slot is SVG.
 *   The CDN also requires a Referer/Origin header (football-logos.cc) or returns 403.
 *   Note: 1500 and 3000 sizes are commonly gated (403) — prefer 700 and below.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, '..', '..');
const AC_JSON_URL = 'https://football-logos.cc/ac.json';
const IMAGE_SIZE = 700;
const MIN_PER_COUNTRY = 10;
const CATEGORY_BLOCKLIST = new Set([
  'tournaments',
  // add here if you want to drop more non-country buckets
]);
const DOWNLOAD_DIR = join(SCRIPT_DIR, '_flcc-downloads');
const OUT_JSON = join(DOWNLOAD_DIR, 'new-logos.json');
const EXISTING_JSON = join(PROJECT_ROOT, 'footy-logos.json');

interface AcEntry {
  categoryId: string;
  categoryName: string;
  categoryEmoji?: string;
  id: string;
  name: string;
  altNames?: string[];
  h: string;
  png?: { sizeBytes: number; dimension: number }[];
  svg?: { sizeBytes: number };
  variantCount?: number;
}

interface NewLogo {
  team_name: string;
  slug: string;
  alt_names: string[];
  country: string;
  country_emoji: string;
  source_image_url: string;
  downloaded_size: number;
  local_path: string;
  hash_full: string;
  png_sizes: number[];
}

function toTitle(id: string): string {
  return id
    .split('-')
    .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

const IMAGE_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36',
  referer: 'https://football-logos.cc/',
  origin: 'https://football-logos.cc',
};

// Canonical slot order — fixed for all entries regardless of which sizes actually exist.
// Slots 0-6 are PNG; slot 7 reserved; slot 8 is SVG.
const CANONICAL_SIZES = [3000, 1500, 700, 512, 256, 128, 64] as const;

function hashForSize(entry: AcEntry, size: number): string | null {
  const idx = CANONICAL_SIZES.indexOf(size as (typeof CANONICAL_SIZES)[number]);
  if (idx < 0) return null;
  // Entry must actually provide this size in its png array.
  const has = (entry.png ?? []).some((p) => p.dimension === size);
  if (!has) return null;
  return entry.h.slice(idx * 8, idx * 8 + 8);
}

function buildImageUrl(entry: AcEntry, size: number): string | null {
  const short = hashForSize(entry, size);
  if (!short) return null;
  return `https://assets.football-logos.cc/logos/${entry.categoryId}/${size}x${size}/${entry.id}.${short}.png`;
}

async function loadExistingSlugs(): Promise<Set<string>> {
  const raw = await readFile(EXISTING_JSON, 'utf8');
  const j = JSON.parse(raw) as { by_competition?: Record<string, Array<{ slug?: string }>> };
  const slugs = new Set<string>();
  for (const teams of Object.values(j.by_competition ?? {})) {
    for (const t of teams) {
      if (t.slug) slugs.add(t.slug);
    }
  }
  return slugs;
}

async function fetchAcJson(): Promise<AcEntry[]> {
  const res = await fetch(AC_JSON_URL, {
    headers: { 'user-agent': 'Mozilla/5.0 football-quizball crawler' },
  });
  if (!res.ok) throw new Error(`ac.json fetch failed: ${res.status}`);
  return (await res.json()) as AcEntry[];
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadOne(entry: AcEntry, outPath: string): Promise<number> {
  if (await exists(outPath)) return 0;
  // Try primary, then smaller fallbacks. Skip 1500/3000 — commonly gated.
  const candidates = [IMAGE_SIZE, 512, 256, 128].filter(
    (s, i, a) => a.indexOf(s) === i,
  );
  let lastStatus = 0;
  for (const size of candidates) {
    const url = buildImageUrl(entry, size);
    if (!url) continue;
    const r = await fetch(url, { headers: IMAGE_HEADERS });
    lastStatus = r.status;
    if (r.ok) {
      await writeFile(outPath, new Uint8Array(await r.arrayBuffer()));
      return size;
    }
  }
  throw new Error(`no size worked for ${entry.id} (last status ${lastStatus})`);
}

async function main() {
  console.log('→ loading existing slugs from footy-logos.json');
  const existing = await loadExistingSlugs();
  console.log(`  ${existing.size} slugs already in DB`);

  console.log('→ fetching ac.json');
  const all = await fetchAcJson();
  console.log(`  ${all.length} total entries`);

  // Count per category
  const perCategory = new Map<string, number>();
  for (const e of all) perCategory.set(e.categoryId, (perCategory.get(e.categoryId) ?? 0) + 1);

  const eligible = all.filter((e) => {
    if (CATEGORY_BLOCKLIST.has(e.categoryId)) return false;
    if ((perCategory.get(e.categoryId) ?? 0) <= MIN_PER_COUNTRY) return false;
    return true;
  });
  console.log(`  ${eligible.length} eligible after country/threshold filter`);

  const fresh = eligible.filter((e) => !existing.has(e.id));
  console.log(`  ${fresh.length} new (not in footy-logos.json)`);

  const skippedByCountry = new Map<string, number>();
  for (const e of eligible) {
    if (existing.has(e.id)) {
      skippedByCountry.set(e.categoryId, (skippedByCountry.get(e.categoryId) ?? 0) + 1);
    }
  }

  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const results: NewLogo[] = [];
  let ok = 0;
  let failed = 0;
  const failures: { id: string; reason: string }[] = [];

  // Sequential with a tiny delay to be polite.
  for (let i = 0; i < fresh.length; i++) {
    const entry = fresh[i];
    const countryDir = join(DOWNLOAD_DIR, entry.categoryId);
    await mkdir(countryDir, { recursive: true });
    const outPath = join(countryDir, `${entry.id}.png`);

    process.stdout.write(`  [${i + 1}/${fresh.length}] ${entry.categoryId}/${entry.id} ... `);
    try {
      const got = await downloadOne(entry, outPath);
      const sourceUrl = buildImageUrl(entry, got || IMAGE_SIZE) ?? '';
      results.push({
        team_name: entry.name || toTitle(entry.id),
        slug: entry.id,
        alt_names: entry.altNames ?? [],
        country: entry.categoryName,
        country_emoji: entry.categoryEmoji ?? '',
        source_image_url: sourceUrl,
        downloaded_size: got,
        local_path: outPath.replace(PROJECT_ROOT + '/', ''),
        hash_full: entry.h,
        png_sizes: (entry.png ?? []).map((p) => p.dimension),
      });
      ok++;
      console.log(`ok (${got}px)`);
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ id: entry.id, reason });
      console.log(`FAIL (${reason})`);
    }

    // polite pacing
    if (i % 20 === 19) await new Promise((r) => setTimeout(r, 300));
  }

  // Group output by country for manual review
  const byCountry: Record<string, NewLogo[]> = {};
  for (const r of results) {
    byCountry[r.country] ??= [];
    byCountry[r.country].push(r);
  }

  await writeFile(
    OUT_JSON,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: 'https://football-logos.cc/ac.json',
        image_size: IMAGE_SIZE,
        min_per_country: MIN_PER_COUNTRY,
        stats: {
          total_site_entries: all.length,
          eligible: eligible.length,
          already_have: existing.size,
          skipped_as_duplicate: Array.from(skippedByCountry.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([c, n]) => ({ country: c, count: n })),
          downloaded: ok,
          failed,
          failures,
        },
        by_country: byCountry,
      },
      null,
      2,
    ),
  );

  console.log('');
  console.log(`✔ downloaded: ${ok}`);
  console.log(`✘ failed:    ${failed}`);
  console.log(`→ wrote ${OUT_JSON}`);
  console.log(`→ images in ${DOWNLOAD_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
