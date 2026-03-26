/**
 * Logo Erasure Generator v2 — Direct SVG analysis approach.
 *
 * Instead of mapping AI descriptions to paths (unreliable), this:
 * 1. Parses the SVG DOM properly (resolving CSS classes)
 * 2. Calculates bounding box area for each element
 * 3. Classifies by computed fill color + area + position
 * 4. Removes elements in stages by classification
 *
 * Usage: npx ts-node scripts/generate-erasure-v2.ts
 */
import * as fs from 'fs';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';

const OUTPUT_DIR = '/private/tmp/logo-erasure-test-v2';

interface SvgElement {
  index: number;
  tag: string;
  computedFill: string;
  computedStroke: string;
  hasText: boolean;
  bbox: { x: number; y: number; width: number; height: number };
  area: number;
  areaPercent: number;
  yCenter: number;
  node: Element;
  description: string;
}

function resolveColor(element: Element, prop: 'fill' | 'stroke', cssMap: Map<string, Record<string, string>>): string {
  // Check inline style first
  const style = element.getAttribute('style') || '';
  const styleMatch = style.match(new RegExp(`${prop}:\\s*([^;]+)`));
  if (styleMatch) return styleMatch[1].trim();

  // Check direct attribute
  const attr = element.getAttribute(prop);
  if (attr) return attr;

  // Check CSS class
  const cls = element.getAttribute('class');
  if (cls && cssMap.has(cls)) {
    const classStyles = cssMap.get(cls)!;
    if (classStyles[prop]) return classStyles[prop];
  }

  // Inherit from parent
  const parent = element.parentElement;
  if (parent && parent.tagName !== 'svg') {
    return resolveColor(parent, prop, cssMap);
  }

  // Default: fill=black for paths, stroke=none
  return prop === 'fill' ? '#000000' : 'none';
}

function parseCssClasses(svgContent: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  const styleMatch = svgContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) return map;

  const css = styleMatch[1];
  const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
  let m;
  while ((m = ruleRegex.exec(css)) !== null) {
    const className = m[1];
    const props: Record<string, string> = {};
    const declarations = m[2].split(';');
    for (const decl of declarations) {
      const [key, value] = decl.split(':').map(s => s.trim());
      if (key && value) props[key] = value;
    }
    map.set(className, props);
  }
  return map;
}

function estimateBBox(element: Element): { x: number; y: number; width: number; height: number } {
  const tag = element.tagName.toLowerCase();

  if (tag === 'circle') {
    const cx = parseFloat(element.getAttribute('cx') || '0');
    const cy = parseFloat(element.getAttribute('cy') || '0');
    const r = parseFloat(element.getAttribute('r') || '0');
    return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
  }

  if (tag === 'ellipse') {
    const cx = parseFloat(element.getAttribute('cx') || '0');
    const cy = parseFloat(element.getAttribute('cy') || '0');
    const rx = parseFloat(element.getAttribute('rx') || '0');
    const ry = parseFloat(element.getAttribute('ry') || '0');
    return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }

  if (tag === 'rect') {
    return {
      x: parseFloat(element.getAttribute('x') || '0'),
      y: parseFloat(element.getAttribute('y') || '0'),
      width: parseFloat(element.getAttribute('width') || '0'),
      height: parseFloat(element.getAttribute('height') || '0'),
    };
  }

  if (tag === 'path') {
    const d = element.getAttribute('d') || '';
    const nums: number[] = [];
    // Extract all numbers from path data
    const numRegex = /[-+]?[0-9]*\.?[0-9]+/g;
    let nm;
    while ((nm = numRegex.exec(d)) !== null) {
      nums.push(parseFloat(nm[0]));
    }
    if (nums.length < 2) return { x: 0, y: 0, width: 0, height: 0 };

    // Separate x and y coordinates (alternating in most path commands)
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < nums.length; i++) {
      if (i % 2 === 0) xs.push(nums[i]);
      else ys.push(nums[i]);
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

function analyzeSvg(svgContent: string): SvgElement[] {
  const cssMap = parseCssClasses(svgContent);
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const svg = doc.querySelector('svg')!;

  // Get viewBox dimensions
  const viewBox = svg.getAttribute('viewBox');
  let totalWidth = 572, totalHeight = 800;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    totalWidth = parts[2] || totalWidth;
    totalHeight = parts[3] || totalHeight;
  }
  const totalArea = totalWidth * totalHeight;

  const shapeSelectors = 'path, circle, ellipse, rect, polygon';
  const shapes = svg.querySelectorAll(shapeSelectors);

  const elements: SvgElement[] = [];
  shapes.forEach((node, index) => {
    const fill = resolveColor(node, 'fill', cssMap);
    const stroke = resolveColor(node, 'stroke', cssMap);
    const bbox = estimateBBox(node);
    const area = bbox.width * bbox.height;
    const areaPercent = (area / totalArea) * 100;
    const yCenter = bbox.y + bbox.height / 2;

    // Check if this is likely text (small area, near text-like proportions)
    const aspectRatio = bbox.width / (bbox.height || 1);
    const hasText = (aspectRatio > 3 && areaPercent < 5) ||
                    (bbox.height < totalHeight * 0.05 && bbox.width > totalWidth * 0.1);

    const yRelative = yCenter / totalHeight;
    const posLabel = yRelative < 0.3 ? 'top' : yRelative > 0.7 ? 'bottom' : 'center';

    elements.push({
      index,
      tag: node.tagName.toLowerCase(),
      computedFill: fill,
      computedStroke: stroke,
      hasText,
      bbox,
      area,
      areaPercent,
      yCenter,
      node,
      description: `${node.tagName}[${index}] fill=${fill} area=${areaPercent.toFixed(1)}% pos=${posLabel}`,
    });
  });

  // Sort by area descending
  elements.sort((a, b) => b.area - a.area);
  return elements;
}

function classifyElements(elements: SvgElement[]): {
  decorative: number[];
  core: number[];
  structural: number[];
} {
  // Strategy:
  // - STRUCTURAL: The 2-3 largest elements (outer borders, main container)
  // - CORE: Medium-sized colored elements (distinctive patterns, central imagery)
  // - DECORATIVE: Small elements (text, stars, small emblems, wreaths)

  const total = elements.length;
  const sorted = [...elements].sort((a, b) => b.areaPercent - a.areaPercent);

  const structural: number[] = [];
  const core: number[] = [];
  const decorative: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const el = sorted[i];

    if (el.areaPercent < 0.01) continue; // Skip invisible elements

    // Largest 2-3 elements are structural (outer ring, main background)
    if (i < 2 || (i < 3 && el.areaPercent > 15)) {
      structural.push(el.index);
    }
    // Small elements (<3% area) are decorative
    else if (el.areaPercent < 3 || el.hasText) {
      decorative.push(el.index);
    }
    // Everything else is core
    else {
      core.push(el.index);
    }
  }

  return { decorative, core, structural };
}

function removeElementsByIndex(svgContent: string, indicesToRemove: Set<number>): string {
  const cssMap = parseCssClasses(svgContent);
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const svg = doc.querySelector('svg')!;

  const shapes = svg.querySelectorAll('path, circle, ellipse, rect, polygon');
  const toRemove: Element[] = [];

  shapes.forEach((node, index) => {
    if (indicesToRemove.has(index)) {
      toRemove.push(node);
    }
  });

  for (const node of toRemove) {
    node.parentNode?.removeChild(node);
  }

  return new dom.window.XMLSerializer().serializeToString(doc);
}

async function svgToPng(svgContent: string, size: number = 512): Promise<Buffer> {
  return sharp(Buffer.from(svgContent))
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

async function processLogo(name: string, svgUrl: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${name}`);
  console.log(`${'='.repeat(60)}`);

  // Download SVG
  const res = await fetch(svgUrl);
  const svgContent = await res.text();

  // Analyze
  const elements = analyzeSvg(svgContent);
  console.log(`\nElements found: ${elements.length}`);
  for (const el of elements) {
    console.log(`  [${el.index.toString().padStart(2)}] ${el.tag.padEnd(7)} fill=${el.computedFill.padEnd(10)} area=${el.areaPercent.toFixed(1).padStart(5)}% text=${el.hasText}`);
  }

  // Classify
  const { decorative, core, structural } = classifyElements(elements);
  console.log(`\nClassification:`);
  console.log(`  Structural (${structural.length}): indices [${structural.join(', ')}]`);
  console.log(`  Core (${core.length}): indices [${core.join(', ')}]`);
  console.log(`  Decorative (${decorative.length}): indices [${decorative.join(', ')}]`);

  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dir = `${OUTPUT_DIR}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });

  // Original
  const origPng = await svgToPng(svgContent);
  fs.writeFileSync(`${dir}/0-original.png`, origPng);

  // EASY: Remove decorative only
  const easySvg = removeElementsByIndex(svgContent, new Set(decorative));
  const easyPng = await svgToPng(easySvg);
  fs.writeFileSync(`${dir}/1-easy.png`, easyPng);
  console.log(`  Easy: removed ${decorative.length} decorative elements`);

  // MEDIUM: Remove decorative + structural → keep core only
  const mediumSvg = removeElementsByIndex(svgContent, new Set([...decorative, ...structural]));
  const mediumPng = await svgToPng(mediumSvg);
  fs.writeFileSync(`${dir}/2-medium.png`, mediumPng);
  console.log(`  Medium: removed ${decorative.length + structural.length} elements (decorative + structural)`);

  // HARD: Remove decorative + core → keep structural skeleton only
  const hardSvg = removeElementsByIndex(svgContent, new Set([...decorative, ...core]));
  const hardPng = await svgToPng(hardSvg);
  fs.writeFileSync(`${dir}/3-hard.png`, hardPng);
  console.log(`  Hard: removed ${decorative.length + core.length} elements (decorative + core)`);

  console.log(`  Output: ${dir}/`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const logos = [
    { name: 'Club Brugge', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg' },
    { name: 'Bayern Munich', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg' },
    { name: 'Union Saint-Gilloise', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg' },
  ];

  for (const logo of logos) {
    await processLogo(logo.name, logo.url);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`All outputs in: ${OUTPUT_DIR}`);
  console.log(`Open in Finder: open ${OUTPUT_DIR}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
