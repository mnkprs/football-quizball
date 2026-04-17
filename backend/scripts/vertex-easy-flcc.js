#!/usr/bin/env node
/**
 * Generate EASY logo erasures for the football-logos.cc crawl batch.
 *
 * Mirrors vertex-generate-erasures.js but reads local PNGs from
 *   backend/scripts/_flcc-downloads/<country>/<slug>.png
 * (produced by crawl-football-logos-cc.ts) and writes to
 *   backend/scripts/_flcc-downloads/<country>/_easy/<slug>.easy.webp
 *
 * Model: gemini-3-pro-image-preview via Vertex AI global endpoint.
 *
 * Usage:
 *   node backend/scripts/vertex-easy-flcc.js                # all logos
 *   node backend/scripts/vertex-easy-flcc.js --limit=50     # first 50
 *   node backend/scripts/vertex-easy-flcc.js --offset=200 --limit=100
 *   node backend/scripts/vertex-easy-flcc.js --country=england
 *   node backend/scripts/vertex-easy-flcc.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { GoogleAuth } = require('google-auth-library');
const sharp = require('sharp');

const PROJECT = 'gen-lang-client-0272230126';
const MODEL = 'gemini-3-pro-image-preview';
const ENDPOINT = `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`;
const KEY_FILE = path.join(__dirname, '..', 'gen-lang-client-0272230126-a40fa469f142.json');
const ROOT = path.join(__dirname, '_flcc-downloads');
const NEW_LOGOS_JSON = path.join(ROOT, 'new-logos.json');
const DECISIONS_JSON = path.join(ROOT, 'decisions.json');

const LEAGUE_RE = new RegExp([
  '\\bleague\\b', '\\bligue\\b', '\\bla liga\\b', '\\beredivisie\\b', '\\bbundesliga\\b',
  '\\bdivisie\\b', '\\bdivision\\b', '\\bdivis[aã]o\\b',
  '\\bchampionship\\b', '\\bchampionnat\\b',
  '\\bfederaci[oó]n\\b', '\\bfederation\\b',
  '\\bregionalliga\\b', '\\bserie [abc]\\b',
  '\\bsupercopa\\b', '\\bsupercup\\b', '\\bsuper cup\\b',
  '\\bsuperleague\\b', '\\bcommunity shield\\b', '\\bsupertrophy\\b',
  '\\bdfb\\b', '\\bfa cup\\b', '\\befl\\b', '\\bknvb\\b',
  '\\bpokal\\b',
  '\\bprimera\\b', '\\bsegunda\\b', '\\btercera\\b', '\\bligaen\\b',
  '^Liga\\b',
].join('|'), 'i');

function isLeagueLogo(teamName) {
  return LEAGUE_RE.test(teamName || '');
}

function loadDecisions() {
  try { return JSON.parse(fs.readFileSync(DECISIONS_JSON, 'utf-8')); }
  catch { return {}; }
}

let offset = 0;
let limit = null;
let dryRun = false;
let onlyCountries = null;
let delayMs = 5000;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--offset=')) offset = parseInt(arg.split('=')[1]);
  if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1]);
  if (arg.startsWith('--country=')) {
    onlyCountries = new Set(arg.split('=')[1].split(',').map((c) => c.trim().toLowerCase()));
  }
  if (arg.startsWith('--delay=')) delayMs = parseInt(arg.split('=')[1]);
  if (arg === '--dry-run') dryRun = true;
}

function flattenLogos() {
  const j = JSON.parse(fs.readFileSync(NEW_LOGOS_JSON, 'utf-8'));
  const decisions = loadDecisions();
  const out = [];
  let skipLeague = 0, skipRejected = 0;
  for (const [country, logos] of Object.entries(j.by_country)) {
    if (onlyCountries && !onlyCountries.has(country.toLowerCase())) continue;
    for (const l of logos) {
      const key = `${country}/${l.slug}`;
      if (decisions[key] === 'reject') { skipRejected++; continue; }
      if (isLeagueLogo(l.team_name)) { skipLeague++; continue; }
      out.push({ ...l, _country: country });
    }
  }
  if (skipLeague || skipRejected) {
    console.log(`  Filtered: ${skipLeague} league/competition, ${skipRejected} previously rejected`);
  }
  return out;
}

async function readPngAsEditInput(localPath) {
  return sharp(localPath)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
}

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return auth.getAccessToken();
}

async function editLogo(accessToken, entry, slugDirForPng) {
  const pngBuffer = await readPngAsEditInput(slugDirForPng);
  const b64 = pngBuffer.toString('base64');
  const isNational = /national|federation|team/i.test(entry.team_name);
  const prompt = isNational
    ? `Edit this image: This is a national football team crest. Remove ALL text and letters from this logo. Remove any country name, federation name, abbreviations, and year numbers. Fill the removed areas with the surrounding background color so it looks clean and natural. Keep the crest shape, shield, animals, stars, and all graphic design elements exactly the same. Do not change colors or shapes.`
    : `Edit this image: This is a football club logo. Remove ALL text and letters from this logo. Remove team name, city name, abbreviations like FC/SC/FK, year numbers like 1899/1920, and any other text. Fill the removed areas with the surrounding background color so it looks clean and natural. Keep the shield/crest shape and all non-text graphic elements (animals, stars, stripes, symbols) exactly the same. Do not change colors or shapes.`;

  const body = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: b64 } },
        { text: prompt },
      ],
    }],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const req = https.request(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          finish(reject, new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString().substring(0, 200)}`));
          return;
        }
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString());
          const cand = j.candidates?.[0];
          const parts = cand?.content?.parts || [];
          const textParts = parts.filter((p) => p.text);
          for (const p of parts) {
            if (p.inlineData) {
              finish(resolve, Buffer.from(p.inlineData.data, 'base64'));
              return;
            }
          }
          finish(reject, new Error(`No image in response (finish: ${cand?.finishReason}, texts: ${textParts.length})`));
        } catch (e) {
          finish(reject, e);
        }
      });
      res.on('error', (e) => finish(reject, e));
    });

    const hardKill = setTimeout(() => {
      req.destroy();
      finish(reject, new Error('Hard timeout (90s)'));
    }, 90000);

    req.on('error', (e) => { clearTimeout(hardKill); finish(reject, e); });
    req.on('close', () => clearTimeout(hardKill));
    req.write(body);
    req.end();
  });
}

async function main() {
  let all = flattenLogos();
  all = all.slice(offset);
  if (limit) all = all.slice(0, limit);

  console.log(`Vertex EASY generation (flcc batch)`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  To process: ${all.length} logos${onlyCountries ? ` (countries=${[...onlyCountries].join(',')})` : ''}`);
  console.log(`  Input PNGs: ${ROOT}/<country>/<slug>.png`);
  console.log(`  Output:     ${ROOT}/<country>/_easy/<slug>.easy.webp`);
  if (dryRun) {
    all.slice(0, 5).forEach((t) => console.log(`  ${t._country}/${t.slug}`));
    return;
  }

  let accessToken = await getAccessToken();
  let tokenTime = Date.now();

  const results = { success: [], failed: [], skipped: [] };
  const startTime = Date.now();

  for (let i = 0; i < all.length; i++) {
    const entry = all[i];
    const inPng = path.join(ROOT, entry._country, `${entry.slug}.png`);
    const outDir = path.join(ROOT, entry._country, '_easy');
    const outPath = path.join(outDir, `${entry.slug}.easy.webp`);

    if (!fs.existsSync(inPng)) {
      results.skipped.push({ slug: entry.slug, reason: 'png missing' });
      continue;
    }
    if (fs.existsSync(outPath)) {
      results.skipped.push({ slug: entry.slug, reason: 'already generated' });
      continue;
    }

    if (Date.now() - tokenTime > 30 * 60 * 1000) {
      accessToken = await getAccessToken();
      tokenTime = Date.now();
    }

    let retryCount = 0;
    let rateLimitRetries = 0;
    const MAX_RATE_LIMIT_RETRIES = 10;
    while (retryCount <= 2) {
      try {
        const imgBuffer = await editLogo(accessToken, entry, inPng);
        const webpBuffer = await sharp(imgBuffer)
          .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .webp({ quality: 85 })
          .toBuffer();
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, webpBuffer);
        results.success.push(entry.slug);

        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (i + 1) / elapsed;
        const eta = Math.round((all.length - i - 1) / rate);
        if ((i + 1) % 10 === 0 || i === 0) {
          console.log(`  [${i + 1}/${all.length}] OK   ${(entry._country + '/' + entry.slug).padEnd(45)} (${rate.toFixed(2)}/s, ETA ${eta}s)`);
        } else {
          console.log(`  [${i + 1}/${all.length}] OK   ${entry._country}/${entry.slug}`);
        }
        if (delayMs > 0 && i < all.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        break;
      } catch (e) {
        const msg = e.message || String(e);
        if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
          rateLimitRetries++;
          if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
            results.failed.push({ slug: entry.slug, country: entry._country, error: `rate-limited ${MAX_RATE_LIMIT_RETRIES}x, giving up` });
            console.log(`  [${i + 1}/${all.length}] FAIL ${entry._country}/${entry.slug} — rate-limited ${MAX_RATE_LIMIT_RETRIES}x, moving on`);
            break;
          }
          console.log(`  [${i + 1}/${all.length}] rate-limited (${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}), waiting 30s`);
          await new Promise((r) => setTimeout(r, 30000));
          continue;
        }
        if (msg.includes('No image in response') && retryCount < 2) {
          retryCount++;
          console.log(`  [${i + 1}/${all.length}] no image, retry ${retryCount}/2 in 5s`);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        results.failed.push({ slug: entry.slug, country: entry._country, error: msg.substring(0, 150) });
        console.log(`  [${i + 1}/${all.length}] FAIL ${entry._country}/${entry.slug} — ${msg.substring(0, 80)}`);
        break;
      }
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    success: results.success.length,
    failed: results.failed.length,
    skipped: results.skipped.length,
    failures: results.failed,
  };
  fs.writeFileSync(path.join(ROOT, 'vertex-easy-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n✔ ok: ${results.success.length}  ✘ failed: ${results.failed.length}  ⤴ skipped: ${results.skipped.length}`);
  console.log(`→ ${ROOT}/vertex-easy-summary.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
