#!/usr/bin/env node
/**
 * Generate the 6 PNG assets used on the public landing page
 * (hero-phone + 5 screenshots). Writes directly to
 * frontend/public/assets/landing/ and clears the .TODO sentinels.
 *
 * Reuses the Vertex service account and gemini-3-pro-image-preview
 * endpoint from vertex-generate-game-bg.js.
 *
 *   node backend/scripts/vertex-generate-landing-assets.js
 *   node backend/scripts/vertex-generate-landing-assets.js --only hero-phone
 *   node backend/scripts/vertex-generate-landing-assets.js --only screenshot-3
 *
 * Idempotent: skips any target that already exists as a real PNG
 * unless --force is passed.
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
const OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'assets', 'landing');

// ── Prompts ─────────────────────────────────────────────────────────────
// TODO(you): tune these if you want a different mood / different mode mix.
// Rule of thumb: describe UI as SHAPES, never as readable TEXT — AI image
// models produce garbled glyphs for any label over ~3 characters.
const PROMPTS = {
  'hero-phone': {
    size: { w: 1200, h: 1500 },
    text: [
      'A modern smartphone held at a subtle 15-degree angle by a hand, photorealistic.',
      'The phone screen glows with a dark football-trivia app UI: deep charcoal #131313 background, a crisp white question card at top, four rounded jewel-tone answer tiles below (emerald, amber, sapphire, violet), a slim glowing ELO bar along the bottom edge.',
      'Background: the out-of-focus interior of a floodlit football stadium at night, warm white floodlight haze blooming from the upper corners, dense bokeh crowd lights in yellow and cool blue.',
      'Composition: phone in sharp focus occupying the right two thirds, stadium bokeh on the left, ample negative space around the phone.',
      'Style: cinematic, premium, high-contrast, subtle film grain, moody.',
      'Important: no readable text anywhere in the image — UI elements are pure shape-language. No logos, no player faces, no ball.',
    ].join(' '),
  },

  'screenshot-1': {
    // Logo Quiz — dark card with partially-obscured crest silhouette.
    size: { w: 1080, h: 2400 },
    text: [
      'A vertical 9:20 mobile-app screen at 1080x2400, portrait.',
      'Subject: a football "guess the crest" game screen.',
      'Background: deep charcoal #131313 with soft floodlight haze in the upper corners.',
      'Center: a large, bold generic soccer club crest SILHOUETTE on a dark glass card — the crest is partially obscured by an abstract violet geometric pattern overlay, so only the outline reads.',
      'Bottom half: four large rounded answer tiles in jewel tones (emerald, amber, sapphire, violet) arranged in a 2x2 grid.',
      'Top: a thin status bar with a glowing emerald ELO indicator (no digits).',
      'Style: premium mobile app UI mockup, crisp rounded corners, cinematic lighting, subtle film grain.',
      'Important: no readable text anywhere — purely shape-language UI. No real club crests, no words, no numbers.',
    ].join(' '),
  },

  'screenshot-2': {
    // Duel — head-to-head avatars.
    size: { w: 1080, h: 2400 },
    text: [
      'A vertical 9:20 mobile-app screen at 1080x2400, portrait.',
      'Subject: a head-to-head football trivia duel screen.',
      'Background: deep charcoal #131313 with a faint emerald pitch-line pattern at the bottom edge and warm floodlight glow at the top.',
      'Upper third: two circular player avatars facing each other across a vertical divider — the left one ringed with warm gold light, the right one ringed with cool blue light. Between them, a small glowing "VS" silhouette (abstract, no readable letters).',
      'Middle: a dark glass question card with a small progress ring around it in emerald.',
      'Lower third: four large rounded answer tiles in jewel tones (emerald, amber, sapphire, violet).',
      'Style: cinematic, premium mobile app UI mockup, crisp rounded corners, subtle film grain.',
      'Important: no readable text, no real faces, no digits. Pure shape-language UI.',
    ].join(' '),
  },

  'screenshot-3': {
    // Battle Royale — grid of avatars, some eliminated.
    size: { w: 1080, h: 2400 },
    text: [
      'A vertical 9:20 mobile-app screen at 1080x2400, portrait.',
      'Subject: a battle-royale-style trivia elimination screen.',
      'Background: deep charcoal #131313 with a subtle red rim light suggesting high stakes.',
      'Upper third: a 4x4 grid of tiny circular player avatars — about ten of them glow emerald (alive), the rest are dimmed grey and slightly translucent (eliminated).',
      'Middle: a tense question card surrounded by a thick circular countdown ring in warm amber, about 40 percent depleted.',
      'Lower third: four large rounded answer tiles in jewel tones (emerald, amber, sapphire, violet).',
      'Style: high-stakes, kinetic, premium mobile app UI mockup, cinematic lighting, subtle film grain.',
      'Important: no readable text, no real faces, no digits. Pure shape-language UI.',
    ].join(' '),
  },

  'screenshot-4': {
    // Solo ELO — ranked climb.
    size: { w: 1080, h: 2400 },
    text: [
      'A vertical 9:20 mobile-app screen at 1080x2400, portrait.',
      'Subject: a solo ranked-ladder progression screen for a football trivia app.',
      'Background: deep charcoal #131313 with a soft cool-blue haze glowing from behind the central element.',
      'Center: a large abstract gemstone-shaped rank badge (diamond/platinum silhouette) glowing cool blue, floating over a faint radial light burst.',
      'Below the badge: a long horizontal ELO progress bar in emerald, partially filled, with a subtle glowing indicator.',
      'Top: a small circular user avatar icon ringed in gold.',
      'Bottom: four large rounded answer tiles in jewel tones (emerald, amber, sapphire, violet).',
      'Style: aspirational, premium mobile app UI mockup, cinematic, subtle film grain.',
      'Important: no readable text, no real faces, no digits. Pure shape-language UI.',
    ].join(' '),
  },

  'screenshot-5': {
    // Blitz — rapid-fire kinetic energy.
    size: { w: 1080, h: 2400 },
    text: [
      'A vertical 9:20 mobile-app screen at 1080x2400, portrait.',
      'Subject: a rapid-fire blitz-round screen for a football trivia app.',
      'Background: deep charcoal #131313 with warm orange and amber light trails arcing across the frame, suggesting speed.',
      'Upper third: a glowing amber streak shaped like a horizontal timer bar, about 30 percent depleted, with soft motion blur.',
      'Middle: a dark glass question card slightly tilted, framed by a fast-moving ring of warm orange light particles.',
      'Lower third: four large rounded answer tiles in jewel tones (emerald, amber, sapphire, violet), each with a subtle pulse glow.',
      'Style: kinetic, energetic, cinematic motion, premium mobile app UI mockup, subtle film grain.',
      'Important: no readable text, no digits. Pure shape-language UI.',
    ].join(' '),
  },
};

// ── Runtime ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlyTarget = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const force = args.includes('--force');

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return auth.getAccessToken();
}

async function generate(accessToken, promptText) {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
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

async function generateOne(accessToken, name, spec) {
  const outPath = path.join(OUT_DIR, `${name}.png`);
  const todoPath = path.join(OUT_DIR, `${name}.png.TODO`);

  if (fs.existsSync(outPath) && !force) {
    console.log(`  ⏭  ${name}.png already exists — skipping (use --force to regenerate)`);
    return;
  }

  console.log(`  🎨  ${name}.png (${spec.size.w}x${spec.size.h}) …`);
  const raw = await generate(accessToken, spec.text);
  console.log(`      received ${raw.length} bytes`);

  const processed = await sharp(raw)
    .resize(spec.size.w, spec.size.h, { fit: 'cover', position: 'center' })
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(outPath, processed);
  if (fs.existsSync(todoPath)) fs.unlinkSync(todoPath);
  console.log(`      wrote ${outPath} (${processed.length} bytes)`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    throw new Error(`Output dir missing: ${OUT_DIR}`);
  }

  const targets = onlyTarget
    ? { [onlyTarget]: PROMPTS[onlyTarget] }
    : PROMPTS;

  for (const [name, spec] of Object.entries(targets)) {
    if (!spec) {
      console.error(`Unknown target: ${name}`);
      process.exit(1);
    }
  }

  console.log(`Generating ${Object.keys(targets).length} landing asset(s) via ${MODEL}…`);
  const accessToken = await getAccessToken();

  for (const [name, spec] of Object.entries(targets)) {
    try {
      await generateOne(accessToken, name, spec);
    } catch (err) {
      console.error(`  ✗  ${name}.png failed: ${err.message}`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
