/**
 * Generate erasure images from Gemini classification + SVG manipulation.
 * Produces easy/medium/hard PNG images for visual comparison.
 *
 * Usage: npx ts-node scripts/generate-erasure-images.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const OUTPUT_DIR = '/tmp/logo-erasure-test';

interface ClassificationElement {
  description: string;
  category: 'decorative' | 'core' | 'structural';
  dominant_color: string;
  position: string;
  approximate_area_percent: number;
}

interface Classification {
  elements: ClassificationElement[];
  erasure_recommendation: {
    easy_remove: string[];
    medium_remove: string[];
    hard_keep: string[];
  };
}

/**
 * Calculate color distance (simple Euclidean in RGB space).
 * Returns 0 for exact match, higher for more different.
 */
function colorDistance(hex1: string, hex2: string): number {
  const parse = (h: string) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  };
  try {
    const [r1,g1,b1] = parse(hex1);
    const [r2,g2,b2] = parse(hex2);
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
  } catch {
    return 999;
  }
}

/**
 * Extract fill color from an SVG element (from style attribute or fill attribute).
 */
function getElementFill(element: string): string | null {
  // Check style="fill:#xxx"
  const styleMatch = element.match(/style="[^"]*fill:\s*(#[0-9a-fA-F]{3,8})/);
  if (styleMatch) return styleMatch[1].toLowerCase();

  // Check fill="#xxx"
  const fillMatch = element.match(/fill="(#[0-9a-fA-F]{3,8})"/);
  if (fillMatch) return fillMatch[1].toLowerCase();

  return null;
}

/**
 * Get approximate vertical position of an SVG element (0=top, 1=bottom).
 */
function getVerticalPosition(element: string, svgHeight: number): number {
  // For circles, use cy
  const cyMatch = element.match(/cy="([0-9.]+)"/);
  if (cyMatch) return parseFloat(cyMatch[1]) / svgHeight;

  // For paths, use first y coordinate in d attribute
  const dMatch = element.match(/d="[mM]\s*[0-9.-]+[,\s]+([0-9.-]+)/);
  if (dMatch) return Math.abs(parseFloat(dMatch[1])) / svgHeight;

  return 0.5; // default to center
}

/**
 * Match Gemini classification elements to SVG path indices using fuzzy color + position.
 */
function matchElementsToSvgPaths(
  svgContent: string,
  classification: Classification,
  svgHeight: number,
): Map<string, number[]> {
  // Extract all path/circle/rect elements with their indices
  const elementRegex = /<(path|circle|ellipse|rect|polygon)[^>]*>/g;
  const svgElements: Array<{ index: number; content: string; fill: string | null; vPos: number }> = [];

  let match;
  let idx = 0;
  while ((match = elementRegex.exec(svgContent)) !== null) {
    const content = match[0];
    svgElements.push({
      index: idx++,
      content,
      fill: getElementFill(content),
      vPos: getVerticalPosition(content, svgHeight),
    });
  }

  console.log(`\nSVG elements found: ${svgElements.length}`);
  for (const el of svgElements) {
    console.log(`  [${el.index}] fill=${el.fill ?? 'none'} vPos=${el.vPos.toFixed(2)}`);
  }

  // Map each classification element to SVG indices
  const categoryMap = new Map<string, number[]>();
  // decorative, core, structural
  categoryMap.set('decorative', []);
  categoryMap.set('core', []);
  categoryMap.set('structural', []);

  const assigned = new Set<number>();

  for (const classEl of classification.elements) {
    let bestMatch = -1;
    let bestScore = Infinity;

    for (const svgEl of svgElements) {
      if (assigned.has(svgEl.index)) continue;

      let score = 0;

      // Color similarity (0-442 range for RGB euclidean)
      if (svgEl.fill && classEl.dominant_color) {
        score += colorDistance(svgEl.fill, classEl.dominant_color);
      } else {
        score += 200; // penalty for no fill info
      }

      // Position similarity
      const posMap: Record<string, number> = { top: 0.15, center: 0.5, bottom: 0.85, background: 0.5 };
      const targetPos = posMap[classEl.position] ?? 0.5;
      score += Math.abs(svgEl.vPos - targetPos) * 200;

      if (score < bestScore) {
        bestScore = score;
        bestMatch = svgEl.index;
      }
    }

    if (bestMatch >= 0) {
      assigned.add(bestMatch);
      const cat = classEl.category;
      categoryMap.get(cat)!.push(bestMatch);
      console.log(`  Matched "${classEl.description}" (${cat}, ${classEl.dominant_color}) → SVG element [${bestMatch}] (score: ${bestScore.toFixed(0)})`);
    }
  }

  return categoryMap;
}

/**
 * Remove SVG elements by index, returning modified SVG string.
 */
function removeSvgElements(svgContent: string, indicesToRemove: Set<number>): string {
  const elementRegex = /<(path|circle|ellipse|rect|polygon)[^>]*\/?>(\s*<\/(path|circle|ellipse|rect|polygon)>)?/g;
  let idx = 0;
  return svgContent.replace(elementRegex, (match) => {
    const currentIdx = idx++;
    if (indicesToRemove.has(currentIdx)) {
      return ''; // Remove this element
    }
    return match;
  });
}

async function svgToPng(svgContent: string, size: number = 512): Promise<Buffer> {
  return sharp(Buffer.from(svgContent))
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load Club Brugge SVG
  const svgPath = '/tmp/club-brugge.svg';
  if (!fs.existsSync(svgPath)) {
    console.log('Downloading Club Brugge SVG...');
    const res = await fetch('https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg');
    fs.writeFileSync(svgPath, Buffer.from(await res.arrayBuffer()));
  }
  const svgContent = fs.readFileSync(svgPath, 'utf-8');

  // Get SVG dimensions
  const heightMatch = svgContent.match(/viewBox="[0-9.]+ [0-9.]+ [0-9.]+ ([0-9.]+)"/);
  const svgHeight = heightMatch ? parseFloat(heightMatch[1]) : 800;
  console.log(`SVG height: ${svgHeight}`);

  // Load classification result for Club Brugge
  const resultsPath = path.join(__dirname, '..', '..', '.gstack', 'logo-classification-results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const brugge = results.find((r: any) => r.name === 'Club Brugge');
  if (!brugge?.result) {
    console.error('No Club Brugge classification found');
    process.exit(1);
  }

  const classification: Classification = brugge.result;

  // Match elements to SVG paths
  const categoryMap = matchElementsToSvgPaths(svgContent, classification, svgHeight);

  const decorative = categoryMap.get('decorative')!;
  const core = categoryMap.get('core')!;
  const structural = categoryMap.get('structural')!;

  console.log(`\nCategory mapping:`);
  console.log(`  Decorative indices: [${decorative.join(', ')}]`);
  console.log(`  Core indices: [${core.join(', ')}]`);
  console.log(`  Structural indices: [${structural.join(', ')}]`);

  // Generate original
  const originalPng = await svgToPng(svgContent);
  fs.writeFileSync(path.join(OUTPUT_DIR, '0-original.png'), originalPng);
  console.log(`\nSaved: 0-original.png`);

  // EASY: Remove decorative elements only
  const easyRemove = new Set(decorative);
  const easySvg = removeSvgElements(svgContent, easyRemove);
  const easyPng = await svgToPng(easySvg);
  fs.writeFileSync(path.join(OUTPUT_DIR, '1-easy.png'), easyPng);
  console.log(`Saved: 1-easy.png (removed ${easyRemove.size} decorative elements)`);

  // MEDIUM: Remove decorative + structural, keep core only
  const mediumRemove = new Set([...decorative, ...structural]);
  const mediumSvg = removeSvgElements(svgContent, mediumRemove);
  const mediumPng = await svgToPng(mediumSvg);
  fs.writeFileSync(path.join(OUTPUT_DIR, '2-medium.png'), mediumPng);
  console.log(`Saved: 2-medium.png (removed ${mediumRemove.size} decorative + structural elements)`);

  // HARD: Remove decorative + core, keep structural only
  const hardRemove = new Set([...decorative, ...core]);
  const hardSvg = removeSvgElements(svgContent, hardRemove);
  const hardPng = await svgToPng(hardSvg);
  fs.writeFileSync(path.join(OUTPUT_DIR, '3-hard.png'), hardPng);
  console.log(`Saved: 3-hard.png (removed ${hardRemove.size} decorative + core elements)`);

  console.log(`\nAll images saved to: ${OUTPUT_DIR}`);
  console.log(`Compare against existing erasures:`);
  console.log(`  Existing easy:   /tmp/logo-samples/club-brugge-easy.webp`);
  console.log(`  Existing medium: /tmp/logo-samples/club-brugge-medium.webp`);
  console.log(`  Existing hard:   /tmp/logo-samples/club-brugge-hard.webp`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
