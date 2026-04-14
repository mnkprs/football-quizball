/**
 * Finalize the selected StepOver logo: strip white background to transparency
 * and export standard App Store + social media sizes.
 *
 * Usage: npx ts-node scripts/finalize-logo.ts <path-to-source.png>
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const SOURCE = process.argv[2];
if (!SOURCE || !fs.existsSync(SOURCE)) {
  console.error('Usage: finalize-logo.ts <source.png>');
  process.exit(1);
}

const OUT_DIR = path.join(path.dirname(SOURCE), 'final');
fs.mkdirSync(OUT_DIR, { recursive: true });

// White→transparent threshold (0..255). Pixels brighter than this become fully transparent.
// Black-on-white logos are very tolerant — 240 is safe.
const WHITE_THRESHOLD = 240;

// Export sizes:
// - 1024  App Store icon master
// - 512   Play Store + WeChat etc.
// - 400   Twitter/X avatar
// - 256   social avatar mid
// - 192   PWA icon
// - 128   favicon-large
// - 64    favicon
// - 32    favicon-small
const SIZES = [1024, 512, 400, 256, 192, 128, 64, 32];

async function makeTransparent(inputPath: string): Promise<Buffer> {
  const img = sharp(inputPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const luminance = (r + g + b) / 3;
    if (luminance >= WHITE_THRESHOLD) {
      out[i + 3] = 0;                       // fully transparent
    } else if (luminance > 128) {
      // smooth the anti-aliased edge: scale alpha by how dark the pixel is
      const alpha = Math.round(((WHITE_THRESHOLD - luminance) / (WHITE_THRESHOLD - 128)) * 255);
      out[i + 3] = alpha;
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; // force dark pixels pure black
    } else {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; // pure black
      out[i + 3] = 255;
    }
  }

  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

async function main(): Promise<void> {
  console.log(`Source: ${SOURCE}`);
  console.log(`Output: ${OUT_DIR}\n`);

  console.log('Stripping background → transparent...');
  const transparent = await makeTransparent(SOURCE);
  const masterPath = path.join(OUT_DIR, 'stepover-logo-master.png');
  fs.writeFileSync(masterPath, transparent);
  const masterMeta = await sharp(masterPath).metadata();
  console.log(`  master: ${masterMeta.width}x${masterMeta.height}`);

  // Also produce a white-background version for App Store (iOS icons can't have alpha)
  const onWhite = await sharp(masterPath)
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, 'stepover-logo-white-bg.png'), onWhite);
  console.log(`  white-bg variant saved (for App Store icon — iOS rejects alpha)`);

  console.log('\nExporting sizes...');
  for (const size of SIZES) {
    const transparentOut = path.join(OUT_DIR, `stepover-${size}.png`);
    const whiteOut = path.join(OUT_DIR, `stepover-${size}-white-bg.png`);

    await sharp(masterPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(transparentOut);

    await sharp(masterPath)
      .resize(size, size, { fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(whiteOut);

    console.log(`  ✓ ${size}x${size} (transparent + white-bg)`);
  }

  console.log(`\nDone. ${OUT_DIR}`);
  console.log('- stepover-logo-master.png   → transparent master (social/web)');
  console.log('- stepover-logo-white-bg.png → white background master (iOS App Store)');
  console.log('- stepover-{size}.png        → transparent exports');
  console.log('- stepover-{size}-white-bg.png → white-bg exports (iOS)');
}

main().catch((e: Error) => { console.error('Fatal:', e.message); process.exit(1); });
