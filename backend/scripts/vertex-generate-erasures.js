/**
 * Generate easy-difficulty logo erasures using Vertex AI (gemini-3-pro-image-preview).
 * Sends each original logo with a prompt to remove text/letters.
 *
 * Usage: node scripts/vertex-generate-erasures.js [--offset=N] [--limit=N] [--dry-run]
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
const OUTPUT_DIR = '/private/tmp/logo-erasures-vertex';
const MISSING_JSON = '/private/tmp/missing-865.json';

// Parse args
let offset = 0, limit = null, dryRun = false;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--offset=')) offset = parseInt(arg.split('=')[1]);
  if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1]);
  if (arg === '--dry-run') dryRun = true;
}

function download(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    mod.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return auth.getAccessToken();
}

async function convertToPng(imgBuffer) {
  return sharp(imgBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
}

async function editLogo(accessToken, slug, name, origUrl) {
  // Download and convert to PNG
  const rawImg = await download(origUrl);
  const pngBuffer = await convertToPng(rawImg);
  const b64 = pngBuffer.toString('base64');

  const isNationalTeam = name.toLowerCase().includes('national team');
  const isLeagueLogo = !name.includes(' ') || ['Liga', 'League', 'Cup', 'Serie', 'Ligue', 'Bundesliga', 'Eredivisie', 'Premiership'].some(w => name.includes(w));

  let prompt;
  if (isNationalTeam) {
    prompt = `Edit this image: This is a national football team crest. Remove ALL text and letters from this logo. Remove any country name, federation name, abbreviations, and year numbers. Fill the removed areas with the surrounding background color so it looks clean and natural. Keep the crest shape, shield, animals, stars, and all graphic design elements exactly the same. Do not change colors or shapes.`;
  } else {
    prompt = `Edit this image: This is a football club logo. Remove ALL text and letters from this logo. Remove team name, city name, abbreviations like FC/SC/FK, year numbers like 1899/1920, and any other text. Fill the removed areas with the surrounding background color so it looks clean and natural. Keep the shield/crest shape and all non-text graphic elements (animals, stars, stripes, symbols) exactly the same. Do not change colors or shapes.`;
  }

  const body = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: b64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  return new Promise((resolve, reject) => {
    const url = new URL(ENDPOINT);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const r = JSON.parse(Buffer.concat(chunks).toString());
          if (r.error) { reject(new Error(r.error.message.substring(0, 200))); return; }
          const parts = r.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData) {
              resolve(Buffer.from(p.inlineData.data, 'base64'));
              return;
            }
          }
          reject(new Error('No image in response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const missing = JSON.parse(fs.readFileSync(MISSING_JSON, 'utf-8'));
  let teams = missing.slice(offset);
  if (limit) teams = teams.slice(0, limit);

  console.log(`Vertex AI Logo Erasure Generation`);
  console.log(`  Model: ${MODEL} (global endpoint)`);
  console.log(`  Total missing: ${missing.length}`);
  console.log(`  Processing: ${teams.length} (offset=${offset}, limit=${limit || 'all'})`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Dry run: ${dryRun}\n`);

  if (dryRun) {
    teams.slice(0, 5).forEach(t => console.log(`  ${t.slug} (${t.name})`));
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let accessToken = await getAccessToken();
  let tokenTime = Date.now();

  const results = { success: [], failed: [] };
  const startTime = Date.now();

  for (let i = 0; i < teams.length; i++) {
    const { slug, name, real: origUrl } = teams[i];

    // Refresh token every 30 minutes
    if (Date.now() - tokenTime > 30 * 60 * 1000) {
      accessToken = await getAccessToken();
      tokenTime = Date.now();
    }

    try {
      const imgBuffer = await editLogo(accessToken, slug, name, origUrl);

      // Convert to webp and save
      const webpBuffer = await sharp(imgBuffer)
        .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .webp({ quality: 85 })
        .toBuffer();

      const outDir = path.join(OUTPUT_DIR, slug);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'easy.webp'), webpBuffer);

      results.success.push(slug);

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = ((teams.length - i - 1) / rate).toFixed(0);

      if ((i + 1) % 10 === 0 || i === 0) {
        console.log(`  [${i + 1}/${teams.length}] OK   ${name.substring(0, 35).padEnd(35)} (${rate.toFixed(1)}/s, ETA: ${eta}s, ok: ${results.success.length}, fail: ${results.failed.length})`);
      } else {
        console.log(`  [${i + 1}/${teams.length}] OK   ${name.substring(0, 35)}`);
      }
    } catch (e) {
      results.failed.push({ slug, name, error: e.message.substring(0, 100) });
      console.log(`  [${i + 1}/${teams.length}] FAIL ${name.substring(0, 35)} — ${e.message.substring(0, 80)}`);

      // If rate limited, wait and retry
      if (e.message.includes('429') || e.message.includes('RESOURCE_EXHAUSTED') || e.message.includes('quota')) {
        console.log(`  ... rate limited, waiting 30s`);
        await new Promise(r => setTimeout(r, 30000));
        i--; // retry
        results.failed.pop();
        continue;
      }
    }

    // Small delay to avoid hammering the API
    await new Promise(r => setTimeout(r, 500));
  }

  // Write manifest
  const manifest = {
    timestamp: new Date().toISOString(),
    success: results.success.length,
    failed: results.failed.length,
    failedList: results.failed,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Done in ${elapsed}s`);
  console.log(`  Success: ${results.success.length}`);
  console.log(`  Failed: ${results.failed.length}`);
  console.log(`  Manifest: ${OUTPUT_DIR}/manifest.json`);
  console.log(`${'='.repeat(50)}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
