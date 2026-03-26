/**
 * Logo Erasure v7 — Smart rule-based + Gemini hybrid
 *
 * Key insight: Football logo SVGs have predictable color patterns:
 * - Gold/amber fills (#d59f0f, #b48b13) = DECORATIVE (stars, wreaths, crowns)
 * - Team primary color fills = CORE (stripes, patterns)
 * - Black/white fills = STRUCTURAL (outlines, backgrounds)
 * - Tiny elements (<0.5% area) = DECORATIVE (dots, small circles)
 *
 * Strategy:
 * 1. Classify by fill color + size
 * 2. Use Gemini ONLY to identify the team's primary distinctive color
 * 3. Remove layers based on classification
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GEMINI_MODEL = 'gemini-2.5-flash';
const OUTPUT_DIR = '/private/tmp/logo-erasure-v7';

function parseCss(svg: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  const m = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) return map;
  for (const r of m[1].matchAll(/\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g)) {
    const p: Record<string, string> = {};
    for (const d of r[2].split(';')) { const [k, v] = d.split(':').map(s => s.trim()); if (k && v) p[k] = v; }
    map.set(r[1], p);
  }
  return map;
}

function resolveColor(el: Element, prop: 'fill' | 'stroke', css: Map<string, Record<string, string>>): string {
  const s = el.getAttribute('style') || '';
  const m = s.match(new RegExp(`${prop}:\\s*([^;]+)`));
  if (m) return m[1].trim();
  const a = el.getAttribute(prop); if (a) return a;
  const c = el.getAttribute('class');
  if (c && css.has(c) && css.get(c)![prop]) return css.get(c)![prop];
  const p = el.parentElement;
  if (p && p.tagName.toLowerCase() !== 'svg') return resolveColor(p, prop, css);
  return prop === 'fill' ? '#000' : 'none';
}

function estimateBBox(el: Element) {
  const t = el.tagName.toLowerCase();
  if (t === 'circle') { const cx=+el.getAttribute('cx')!, cy=+el.getAttribute('cy')!, r=+el.getAttribute('r')!; return {x:cx-r,y:cy-r,w:r*2,h:r*2}; }
  if (t === 'ellipse') { const cx=+el.getAttribute('cx')!, cy=+el.getAttribute('cy')!, rx=+el.getAttribute('rx')!, ry=+el.getAttribute('ry')!; return {x:cx-rx,y:cy-ry,w:rx*2,h:ry*2}; }
  if (t === 'path') {
    const d = el.getAttribute('d') || '';
    const nums: number[] = []; for (const m of d.matchAll(/[-+]?[0-9]*\.?[0-9]+/g)) nums.push(+m[0]);
    if (nums.length < 4) return {x:0,y:0,w:0,h:0};
    const xs = nums.filter((_,i)=>i%2===0), ys = nums.filter((_,i)=>i%2===1);
    return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  return {x:0,y:0,w:0,h:0};
}

function hexToRgb(hex: string): [number, number, number] | null {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  if (hex.length !== 6) return null;
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

function isGoldish(hex: string): boolean {
  const rgb = hexToRgb(hex); if (!rgb) return false;
  const [r, g, b] = rgb;
  // Gold/amber: high red, medium-high green, low blue
  return r > 150 && g > 80 && g < 220 && b < 80 && r > b * 2;
}

function isWhitish(hex: string): boolean {
  const rgb = hexToRgb(hex); if (!rgb) return false;
  return rgb[0] > 230 && rgb[1] > 230 && rgb[2] > 230;
}

function isBlackish(hex: string): boolean {
  const rgb = hexToRgb(hex); if (!rgb) return false;
  return rgb[0] < 30 && rgb[1] < 30 && rgb[2] < 30;
}

function isNone(fill: string): boolean {
  return fill === 'none' || fill === 'transparent';
}

interface ElemInfo {
  index: number;
  tag: string;
  fill: string;
  area: number;
  areaPct: number;
  isGold: boolean;
  isWhite: boolean;
  isBlack: boolean;
  isNone: boolean;
  isTeamColor: boolean;
  isTiny: boolean;
}

function analyzeElements(svg: string, teamColors: string[]): ElemInfo[] {
  const css = parseCss(svg);
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const shapes = dom.window.document.querySelectorAll('path, circle, ellipse, rect, polygon');

  // Calculate total content area
  let totalArea = 0;
  const bboxes: ReturnType<typeof estimateBBox>[] = [];
  shapes.forEach(n => { const b = estimateBBox(n); bboxes.push(b); totalArea = Math.max(totalArea, b.w * b.h); });

  const elems: ElemInfo[] = [];
  shapes.forEach((n, i) => {
    const fill = resolveColor(n, 'fill', css).toLowerCase();
    const bb = bboxes[i];
    const area = bb.w * bb.h;
    const areaPct = totalArea > 0 ? (area / totalArea) * 100 : 0;

    const isTeamColor = teamColors.some(tc => {
      const rgb1 = hexToRgb(fill), rgb2 = hexToRgb(tc);
      if (!rgb1 || !rgb2) return false;
      const dist = Math.sqrt((rgb1[0]-rgb2[0])**2 + (rgb1[1]-rgb2[1])**2 + (rgb1[2]-rgb2[2])**2);
      return dist < 80; // fuzzy match
    });

    elems.push({
      index: i, tag: n.tagName.toLowerCase(), fill,
      area, areaPct,
      isGold: isGoldish(fill),
      isWhite: isWhitish(fill) || fill === '#fff',
      isBlack: isBlackish(fill) || fill === '#000' || fill === '#000000',
      isNone: isNone(fill),
      isTeamColor,
      isTiny: areaPct < 0.5,
    });
  });

  return elems;
}

function removeElements(svg: string, indices: Set<number>): string {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const shapes = dom.window.document.querySelectorAll('path, circle, ellipse, rect, polygon');
  const rm: Element[] = []; shapes.forEach((n, i) => { if (indices.has(i)) rm.push(n); });
  for (const n of rm) n.parentNode?.removeChild(n);
  return new dom.window.XMLSerializer().serializeToString(dom.window.document);
}

function convertToOutlines(svg: string, keep: Set<number>): string {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const shapes = doc.querySelectorAll('path, circle, ellipse, rect, polygon');
  const rm: Element[] = [];
  shapes.forEach((n, i) => {
    if (!keep.has(i)) { rm.push(n); return; }
    n.setAttribute('style', 'fill:none;stroke:#000;stroke-width:3');
    n.removeAttribute('fill'); n.removeAttribute('stroke'); n.removeAttribute('class');
  });
  for (const n of rm) n.parentNode?.removeChild(n);
  const st = doc.querySelector('style'); if (st) st.parentNode?.removeChild(st);
  return new dom.window.XMLSerializer().serializeToString(doc);
}

async function svgToPng(svg: string | Buffer, size = 512): Promise<Buffer> {
  return sharp(typeof svg === 'string' ? Buffer.from(svg) : svg)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png().toBuffer();
}

async function getTeamColors(gemini: GoogleGenAI, pngBuffer: Buffer): Promise<string[]> {
  const resp = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'image/png', data: pngBuffer.toString('base64') } },
      { text: 'What are the 1-3 PRIMARY team colors of this football club logo? Not gold/silver decorative colors, not black/white — just the distinctive team colors (e.g. blue, red). Return JSON: {"team_name":"...","colors":["#hex1","#hex2"]}' },
    ]}],
    config: { temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
  });
  try {
    const r = JSON.parse(resp.text ?? '');
    console.log(`Team: ${r.team_name}, colors: ${r.colors?.join(', ')}`);
    return r.colors || [];
  } catch { return []; }
}

async function processLogo(gemini: GoogleGenAI, name: string, svgUrl: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(name);
  console.log('='.repeat(60));

  const svgContent = await (await fetch(svgUrl)).text();
  const origPng = await svgToPng(svgContent);

  // Ask Gemini for team colors only (simple, reliable)
  const teamColors = await getTeamColors(gemini, origPng);

  // Analyze all elements
  const elems = analyzeElements(svgContent, teamColors);
  const total = elems.length;

  console.log(`\nElements: ${total}`);
  for (const e of elems) {
    const flags = [
      e.isGold ? 'GOLD' : '',
      e.isWhite ? 'WHITE' : '',
      e.isBlack ? 'BLACK' : '',
      e.isNone ? 'NONE' : '',
      e.isTeamColor ? 'TEAM' : '',
      e.isTiny ? 'TINY' : '',
    ].filter(Boolean).join(',');
    console.log(`  [${e.index.toString().padStart(2)}] ${e.tag.padEnd(7)} fill=${e.fill.padEnd(10)} area=${e.areaPct.toFixed(1).padStart(5)}%  ${flags}`);
  }

  // EASY: Remove gold/amber elements + tiny elements
  const easyRemove = new Set(elems.filter(e => e.isGold || e.isTiny).map(e => e.index));

  // MEDIUM: Keep only team-color elements + the single largest non-white non-gold element
  const teamColorElems = elems.filter(e => e.isTeamColor && !e.isGold && !e.isTiny);
  // If no team color matches, keep the largest colored (non-black, non-white, non-gold) elements
  let coreElems = teamColorElems.length > 0 ? teamColorElems :
    elems.filter(e => !e.isBlack && !e.isWhite && !e.isGold && !e.isNone && !e.isTiny)
      .sort((a, b) => b.areaPct - a.areaPct)
      .slice(0, 5);

  // Also keep the largest black element if it's the main shape outline (>20% area)
  const bigBlackElems = elems.filter(e => (e.isBlack || e.isNone) && e.areaPct > 15);

  const mediumKeep = new Set([...coreElems.map(e => e.index), ...bigBlackElems.map(e => e.index)]);
  const mediumRemove = new Set(elems.filter(e => !mediumKeep.has(e.index)).map(e => e.index));

  // HARD: Keep only the 2-3 largest elements (structural skeleton)
  const hardElems = [...elems].sort((a, b) => b.areaPct - a.areaPct).slice(0, 3);
  const hardKeep = new Set(hardElems.map(e => e.index));

  console.log(`\nEasy:   remove ${easyRemove.size} (gold + tiny)`);
  console.log(`Medium: keep ${mediumKeep.size} (team color + large black)`);
  console.log(`Hard:   keep ${hardKeep.size} (largest elements as outlines)`);

  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dir = `${OUTPUT_DIR}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(`${dir}/0-original.png`, origPng);
  fs.writeFileSync(`${dir}/1-easy.png`, await svgToPng(removeElements(svgContent, easyRemove)));
  fs.writeFileSync(`${dir}/2-medium.png`, await svgToPng(removeElements(svgContent, mediumRemove)));
  fs.writeFileSync(`${dir}/3-hard.png`, await svgToPng(convertToOutlines(svgContent, hardKeep)));
  console.log(`Output: ${dir}/`);
}

async function main() {
  const k = process.env.VERTEX_AI_KEY, p = process.env.GOOGLE_CLOUD_PROJECT;
  const gemini = k ? new GoogleGenAI({ vertexai: true, apiKey: k }) : p ? new GoogleGenAI({ vertexai: true, project: p, location: 'us-central1' }) : null;
  if (!gemini) { console.error('No credentials'); process.exit(1); }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const logo of [
    { name: 'Club Brugge', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg' },
    { name: 'Bayern Munich', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg' },
    { name: 'FC Barcelona', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg' },
    { name: 'Union Saint-Gilloise', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg' },
  ]) {
    try { await processLogo(gemini, logo.name, logo.url); await new Promise(r => setTimeout(r, 3000)); }
    catch (e) { console.error(`ERROR ${logo.name}:`, (e as Error).message); }
  }
  console.log(`\nAll outputs: ${OUTPUT_DIR}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
