import * as fs from 'fs';
import * as path from 'path';

/**
 * Canonical entity loader.
 *
 * The cleaned entity list is the source of truth for valid subject_ids /
 * league_ids. It's produced by the review UI
 * (backend/scripts/review-canonical-entities.ts) and lives at
 * backend/scripts/_backfill-pool/canonical-entities.cleaned.json.
 *
 * During backfill, the full list is embedded in the classifier's system prompt
 * so Gemini can only pick a slug that exists here. Post-call validation rejects
 * anything that drifted.
 */

export type EntityType =
  | 'player'
  | 'team'
  | 'league'
  | 'trophy'
  | 'manager'
  | 'stadium'
  | 'country';

export interface CanonicalEntity {
  type: EntityType;
  slug: string;
  display_name: string;
  aliases: string[];
  mention_count: number;
}

export interface CanonicalIndex {
  all: CanonicalEntity[];
  bySlug: Map<string, CanonicalEntity>; // key: `${type}::${slug}`
  byType: Map<EntityType, CanonicalEntity[]>;
}

/**
 * Resolved at runtime. The primary location is co-located with this module
 * (bundled into dist via nest-cli assets). The scripts location is a fallback
 * used only by CLI tools that run before the module is in dist.
 */
const CANDIDATE_PATHS = [
  path.resolve(__dirname, 'canonical-entities.cleaned.json'),
  path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    '_backfill-pool',
    'canonical-entities.cleaned.json',
  ),
];

let cache: CanonicalIndex | null = null;

export function loadCanonicalEntities(filePath?: string): CanonicalIndex {
  if (cache) return cache;
  const pathsToTry = filePath ? [filePath] : CANDIDATE_PATHS;
  const found = pathsToTry.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `Canonical entities file not found. Tried: ${pathsToTry.join(', ')}. Run pool:extract-entities + pool:review-entities first.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(found, 'utf8')) as {
    entities: CanonicalEntity[];
  };
  const all = raw.entities;
  const bySlug = new Map<string, CanonicalEntity>();
  const byType = new Map<EntityType, CanonicalEntity[]>();
  for (const e of all) {
    bySlug.set(`${e.type}::${e.slug}`, e);
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e);
  }
  cache = { all, bySlug, byType };
  return cache;
}

export function isKnownSlug(
  index: CanonicalIndex,
  type: EntityType,
  slug: string
): boolean {
  return index.bySlug.has(`${type}::${slug}`);
}

/**
 * Strip structural tokens from strings before they are embedded into a system
 * prompt. Prevents adversarial display_names / aliases from introducing fake
 * section headers or control sequences that could mislead the classifier.
 * The canonical review pass should catch these, but defence-in-depth is cheap.
 */
export function sanitiseForPrompt(s: string, max = 120): string {
  // Order matters: strip line-start '#' headers BEFORE collapsing newlines.
  // Otherwise "name\n## injection" becomes "name ## injection" and the
  // ^#+ regex (which only matches at line start) can no longer reach it.
  return s
    .replace(/^#+\s*/gm, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Format the canonical list for embedding in a system prompt.
 * Compact one-line-per-entity format, grouped by type.
 * Example line: `lionel-messi | Lionel Messi | Leo Messi, La Pulga`
 */
export function formatCanonicalListForPrompt(index: CanonicalIndex): string {
  const parts: string[] = [];
  const orderedTypes: EntityType[] = [
    'player',
    'team',
    'league',
    'trophy',
    'manager',
    'stadium',
    'country',
  ];
  for (const type of orderedTypes) {
    const list = index.byType.get(type) ?? [];
    if (list.length === 0) continue;
    parts.push(`\n### ${type.toUpperCase()} (${list.length})`);
    for (const e of list) {
      const name = sanitiseForPrompt(e.display_name);
      const aliases = e.aliases.length
        ? ` | ${e.aliases.map((a) => sanitiseForPrompt(a)).join(', ')}`
        : '';
      parts.push(`${e.slug} | ${name}${aliases}`);
    }
  }
  return parts.join('\n');
}
