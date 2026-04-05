/**
 * Logo Quiz — Pixelation-based difficulty test
 *
 * Generates easy/medium/hard versions using image processing effects.
 * 100% deterministic, no AI, works on any image.
 *
 * Usage: npx ts-node scripts/generate-pixelation-test.ts
 */
import * as fs from 'fs';
import sharp from 'sharp';

const OUTPUT_DIR = '/private/tmp/logo-pixelation-test';

const LOGOS = [
  { name: 'Club Brugge', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg' },
  { name: 'Bayern Munich', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg' },
  { name: 'FC Barcelona', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg' },
  { name: 'Union Saint-Gilloise', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg' },
  { name: 'Ajax', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f605fe448549ca2560b16b_ajax-amsterdam-footballlogos-org.svg' },
];

const OUTPUT_SIZE = 512;

function renderSvg(svgBuffer: Buffer): Promise<Buffer> {
  return sharp(svgBuffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

/** Pixelate: shrink to tiny size then scale back up with nearest-neighbor */
async function pixelate(png: Buffer, pixelSize: number): Promise<Buffer> {
  const tiny = await sharp(png)
    .resize(pixelSize, pixelSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  return sharp(tiny)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

/** Blur effect */
function blur(png: Buffer, sigma: number): Promise<Buffer> {
  return sharp(png)
    .blur(sigma)
    .png()
    .toBuffer();
}

/** Grayscale */
function grayscale(png: Buffer): Promise<Buffer> {
  return sharp(png)
    .grayscale()
    .png()
    .toBuffer();
}

/** Silhouette: convert all non-white pixels to black */
function silhouette(png: Buffer): Promise<Buffer> {
  // Threshold: anything not near-white becomes black
  return sharp(png)
    .threshold(240)
    .negate() // invert so logo is black on white
    .png()
    .toBuffer();
}

/** Crop: show only a section of the logo */
async function cropSection(png: Buffer, region: 'center' | 'top-left' | 'bottom-right'): Promise<Buffer> {
  const size = OUTPUT_SIZE;
  const cropSize = Math.floor(size * 0.35);
  let left: number, top: number;

  switch (region) {
    case 'center': left = Math.floor((size - cropSize) / 2); top = Math.floor((size - cropSize) / 2); break;
    case 'top-left': left = Math.floor(size * 0.15); top = Math.floor(size * 0.15); break;
    case 'bottom-right': left = Math.floor(size * 0.5); top = Math.floor(size * 0.5); break;
  }

  const cropped = await sharp(png)
    .extract({ left, top, width: cropSize, height: cropSize })
    .png()
    .toBuffer();

  // Place on white canvas at original size
  const canvas = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  }).png().toBuffer();

  return sharp(canvas)
    .composite([{ input: cropped, left: Math.floor((size - cropSize) / 2), top: Math.floor((size - cropSize) / 2) }])
    .png()
    .toBuffer();
}

async function processLogo(name: string, svgUrl: string) {
  console.log(`Processing: ${name}`);

  const res = await fetch(svgUrl);
  const svgBuffer = Buffer.from(await res.arrayBuffer());
  const png = await renderSvg(svgBuffer);

  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dir = `${OUTPUT_DIR}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });

  // Original
  fs.writeFileSync(`${dir}/0-original.png`, png);

  // === STRATEGY A: Pixelation only ===
  fs.writeFileSync(`${dir}/A1-easy-pixel.png`, await pixelate(png, 48));
  fs.writeFileSync(`${dir}/A2-medium-pixel.png`, await pixelate(png, 24));
  fs.writeFileSync(`${dir}/A3-hard-pixel.png`, await pixelate(png, 12));

  // === STRATEGY B: Blur ===
  fs.writeFileSync(`${dir}/B1-easy-blur.png`, await blur(png, 5));
  fs.writeFileSync(`${dir}/B2-medium-blur.png`, await blur(png, 15));
  fs.writeFileSync(`${dir}/B3-hard-blur.png`, await blur(png, 40));

  // === STRATEGY C: Mixed (best of each) ===
  // Easy: slight blur + slight pixelation
  fs.writeFileSync(`${dir}/C1-easy-mixed.png`, await pixelate(await blur(png, 3), 64));
  // Medium: grayscale + medium pixelation
  fs.writeFileSync(`${dir}/C2-medium-mixed.png`, await pixelate(await grayscale(png), 24));
  // Hard: silhouette (just the shape in black)
  fs.writeFileSync(`${dir}/C3-hard-mixed.png`, await silhouette(png));

  // === STRATEGY D: Crop reveal ===
  // Easy: center crop (see core pattern)
  fs.writeFileSync(`${dir}/D1-easy-crop.png`, await cropSection(png, 'center'));
  // Medium: corner crop (see partial)
  fs.writeFileSync(`${dir}/D2-medium-crop.png`, await cropSection(png, 'top-left'));
  // Hard: small corner + pixelated
  fs.writeFileSync(`${dir}/D3-hard-crop.png`, await cropSection(await pixelate(png, 32), 'bottom-right'));

  console.log(`  Output: ${dir}/`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const logo of LOGOS) {
    await processLogo(logo.name, logo.url);
  }

  console.log(`\nAll outputs: ${OUTPUT_DIR}`);
  console.log(`\nStrategies to compare:`);
  console.log(`  A = Pixelation only (48px → 24px → 12px)`);
  console.log(`  B = Blur only (sigma 5 → 15 → 40)`);
  console.log(`  C = Mixed (blur+pixel → grayscale+pixel → silhouette)`);
  console.log(`  D = Crop reveal (center → corner → corner+pixelated)`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
