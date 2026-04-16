#!/usr/bin/env bun
/**
 * Generate HARD logo variants: horizontal flip (mirror) + desaturate.
 *
 * Input:  /backend/scripts/_flcc-downloads/<country>/_easy/<slug>.easy.webp
 * Output: /backend/scripts/_flcc-downloads/<country>/_hard/<slug>.hard.webp
 *
 * HARD is derived from the Gemini-produced EASY (text removed) so that the
 * cascade of variants shares the same content. Logos without an easy variant
 * are skipped.
 */
import { readdir, stat, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '_flcc-downloads');
const WEBP_QUALITY = 85;

async function isDir(p: string) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function processLogo(srcWebp: string, dstWebp: string) {
  await sharp(srcWebp)
    .flop()                    // horizontal mirror (x-axis inversion)
    .modulate({ saturation: 0 }) // fully desaturate, keep luminance
    .webp({ quality: WEBP_QUALITY })
    .toFile(dstWebp);
}

async function main() {
  const countries = (await readdir(ROOT)).filter((n) => !n.startsWith('_') && !n.endsWith('.json'));
  let ok = 0, skipped = 0, failed = 0;

  for (const country of countries) {
    const dir = join(ROOT, country);
    if (!(await isDir(dir))) continue;

    const easyDir = join(dir, '_easy');
    if (!(await isDir(easyDir))) { continue; }

    const hardDir = join(dir, '_hard');
    await mkdir(hardDir, { recursive: true });

    const files = (await readdir(easyDir)).filter((f) => f.endsWith('.easy.webp'));
    for (const f of files) {
      const src = join(easyDir, f);
      const dst = join(hardDir, f.replace(/\.easy\.webp$/, '.hard.webp'));
      try {
        await processLogo(src, dst);
        ok++;
      } catch (err) {
        failed++;
        console.error(`FAIL ${country}/${f}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (files.length) process.stdout.write(`  ${country}: ${files.length} done\n`);
  }

  console.log(`\n✔ generated: ${ok}`);
  if (failed) console.log(`✘ failed:    ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
