#!/usr/bin/env node
/**
 * One-shot: generate the floodlit stadium background used behind the
 * in-game screens (board/question/result). Writes webp to frontend/public/.
 *
 * Reuses the existing Vertex service account and gemini-3-pro-image-preview
 * endpoint from vertex-easy-flcc.js.
 *
 *   node backend/scripts/vertex-generate-game-bg.js
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
const OUT = path.join(__dirname, '..', '..', 'frontend', 'public', 'game-bg.webp');

const PROMPT = [
  'A vertical 9:16 mobile-app background.',
  'Subject: the inside of a large football stadium at night, seen from mid-pitch looking up toward the stands.',
  'Four massive floodlight towers at the top corners throw warm white light that blooms softly into the sky.',
  'The lower half is a deep emerald pitch receding into shadow, with faint chalk lines barely visible.',
  'The middle band shows the crowd as a dense sea of tiny warm-yellow and cool-blue bokeh points, heavily out of focus.',
  'The upper band is a dark inky sky with floodlight haze.',
  'Style: cinematic, moody, high-contrast, atmospheric, fine film grain.',
  'Color palette: predominantly very dark (charcoal #131313 base) with warm floodlight highlights and subtle blue rim light.',
  'Important: 80 percent of the pixels must be near-black so UI can sit on top at full contrast.',
  'No text, no logos, no players, no ball, no scoreboard.',
  'Framing: the brightest region sits in the upper third; the middle and lower thirds are noticeably darker.',
  'Looks like a quiet pause before kickoff, not an action shot.',
].join(' ');

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return auth.getAccessToken();
}

async function generate(accessToken) {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
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
          finish(reject, new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString().substring(0, 500)}`));
          return;
        }
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString());
          const cand = j.candidates?.[0];
          const parts = cand?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData) {
              finish(resolve, Buffer.from(p.inlineData.data, 'base64'));
              return;
            }
          }
          finish(reject, new Error(`No image in response (finish: ${cand?.finishReason})`));
        } catch (e) {
          finish(reject, e);
        }
      });
      res.on('error', (e) => finish(reject, e));
    });

    const hardKill = setTimeout(() => {
      req.destroy();
      finish(reject, new Error('Hard timeout (120s)'));
    }, 120000);

    req.on('error', (e) => { clearTimeout(hardKill); finish(reject, e); });
    req.on('close', () => clearTimeout(hardKill));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`Generating floodlit stadium BG via ${MODEL}...`);
  const accessToken = await getAccessToken();
  const raw = await generate(accessToken);
  console.log(`  Received ${raw.length} bytes`);

  // Portrait 9:16 @ 1080x1920, then darken slightly so UI always wins
  const processed = await sharp(raw)
    .resize(1080, 1920, { fit: 'cover', position: 'center' })
    .modulate({ brightness: 0.85 })
    .webp({ quality: 78 })
    .toBuffer();

  fs.writeFileSync(OUT, processed);
  console.log(`  Wrote ${OUT} (${processed.length} bytes)`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
