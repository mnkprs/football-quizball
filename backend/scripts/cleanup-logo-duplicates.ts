#!/usr/bin/env npx ts-node
/**
 * Clean up duplicate team entries from footy-logos.json and Supabase question_pool.
 *
 * For each duplicate pair, keeps the official/full name and removes the short/variant.
 * Deletes corresponding LOGO_QUIZ rows from question_pool by slug.
 *
 * Usage: npx ts-node scripts/cleanup-logo-duplicates.ts [--dry-run]
 */
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOGOS_JSON = path.join(__dirname, '..', '..', 'footy-logos.json');

interface TeamLogo {
  team_name: string;
  slug: string;
  [key: string]: unknown;
}

interface LogosJson {
  by_competition: Record<string, TeamLogo[]>;
}

/**
 * Slugs to REMOVE (the duplicate/short variant).
 * For each pair we keep the official name and drop the variant.
 *
 * Format: [slug_to_remove, competition_key (or null for any match)]
 */
const SLUGS_TO_REMOVE: Array<[string, string | null]> = [
  // --- Same-league duplicates ---
  // Liga MX: keep "Pumas Unam", remove "UNAM Pumas"
  ['unam-pumas', 'liga-mx'],
  // Premier League: keep "West Ham United", remove "West Ham"
  ['west-ham', 'premier-league'],
  // Premier League: keep "Tottenham Hotspur", remove "Tottenham"
  ['tottenham', 'premier-league'],
  // Premier League: keep "Brighton And Hove Albion", remove "Brighton & Hove Albion"
  ['brighton-hove-albion', 'premier-league'],
  // EFL Championship: keep "Leicester City", remove "Leicester"
  ['leicester', 'efl-championship'],
  // EFL Championship: keep "Charlton Athletic", remove "Charlton"
  ['charlton', 'efl-championship'],
  // EFL Championship: keep "Swansea City", remove "Swansea"
  ['swansea', 'efl-championship'],
  // Eredivisie: keep "Heracles Almelo", remove "Heracles"
  ['heracles', 'eredivisie'],
  // La Liga: keep "Levante Ud", remove "Levante"
  ['levante', 'laliga'],
  // La Liga: keep "Athletic Club Bilbao", remove "Athletic Bilbao"
  ['athletic-bilbao', 'laliga'],
  // La Liga: keep "Rcd Espanyol Barcelona", remove "Espanyol"
  ['espanyol', 'laliga'],
  // Ligue 1: keep "Angers Sco", remove "Angers"
  ['angers', 'ligue-1'],
  // Ligue 1: keep "Aj Auxerre", remove "Auxerre"
  ['auxerre', 'ligue-1'],
  // Ligue 1: keep "Stade Brestois 29", remove "Brest"
  ['brest', 'ligue-1'],
  // Ligue 1: keep "Rc Strasbourg Alsace", remove "Strasbourg"
  ['strasbourg', 'ligue-1'],
  // Bundesliga: keep "Tsg Hoffenheim", remove "Hoffenheim"
  ['hoffenheim', 'bundesliga'],
  // Bundesliga: keep "Hamburger Sv", remove "Hamburger"
  ['hamburger', 'bundesliga'],
  // MLS: keep "Atlanta United", remove "Atlanta"
  ['atlanta', 'mls'],
  // MLS: keep "New York Red Bulls", remove "Red Bull NY"
  ['red-bull-ny', 'mls'],
  // MLS: keep "St Louis City Sc", remove "St. Louis City"
  ['st-louis-city', 'mls'],
  // MLS: keep "San Jose Earthquakes", remove "San Jose Quakes"
  ['san-jose-quakes', 'mls'],
  // Brasileirao A: keep "Vasco Da Gama", remove "Vasco de Gama"
  ['vasco-de-gama', 'brasileirao-serie-a'],
  // Brasileirao B: keep "Athletic Club (BR)", remove "Athletic"
  ['athletic', 'brasileirao-serie-b'],
  // Brasileirao B: keep "Clube de Remo", remove "Club De Remo"
  ['club-de-remo', 'brasileirao-serie-b'],
  // Liga Portugal: keep "Vitoria Sc", remove "Vitoria (PT)"
  ['vitoria-pt', 'liga-portugal'],
  // Copa Libertadores: keep "Sporting Cristal", remove "Sporting Cristal 88646"
  ['sporting-cristal-88646', 'copa-libertadores'],
  // Copa Libertadores: keep "Alianza Lima", remove "Alianza Lima 729d5"
  ['alianza-lima-729d5', 'copa-libertadores'],
  // Copa Libertadores: keep "Universitario", remove "Universitario Peru"
  ['universitario-peru', 'copa-libertadores'],
  // Copa Libertadores: keep "2 de Mayo", remove "Club Sportivo 2 De Mayo"
  ['club-sportivo-2-de-mayo', 'copa-libertadores'],
  // Copa Libertadores: keep "La Guaira", remove "Deportivo La Guaira"
  ['deportivo-la-guaira', 'copa-libertadores'],
  // Copa Libertadores: keep "Nacional (Uruguay)", remove "Nacional"
  ['nacional', 'copa-libertadores'],
  // Europa League: keep "Red Star Belgrade", remove "Red Star Belgrad"
  ['red-star-belgrad', 'europa-league'],
  // Andorra: keep "Ue Santa Coloma", remove "Fc Santa Coloma"
  ['fc-santa-coloma', 'primera-divisio-andorra'],
  // World Cup 2026: keep "Netherlands", remove "Netherlands National Team Dutch"
  ['netherlands-national-team-dutch', 'fifa-world-cup-2026'],

  // --- Cross-league duplicates (team in domestic + European comp, remove European short name) ---
  ['dortmund', 'uefa-champions-league'],
  ['psv', 'uefa-champions-league'],
  ['benfica', 'uefa-champions-league'],
  ['salzburg', 'europa-league'],
  ['psg', 'uefa-champions-league'],
  ['monaco', 'uefa-champions-league'],
  ['marseille', 'uefa-champions-league'],
  ['lille-losc', 'europa-league'],
  ['sturm-graz', 'europa-league'],
  ['utrecht', 'europa-league'],
  ['copenhagen', 'uefa-champions-league'],
  ['bodo-glimt', 'uefa-champions-league'],
  ['brann', 'europa-league'],
  ['pafos', 'uefa-champions-league'],
  ['qarabag', 'uefa-champions-league'],
  ['roma', 'europa-league'],
  ['real-betis', 'europa-league'],
  ['malmo', 'europa-league'],
  ['sporting', 'uefa-champions-league'],
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const data: LogosJson = JSON.parse(await readFile(LOGOS_JSON, 'utf-8'));

  console.log(`Cleanup Logo Duplicates${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('─'.repeat(50));

  // Build a set of (slug, competition) pairs to remove
  const toRemove = new Set(
    SLUGS_TO_REMOVE.map(([slug, comp]) => `${slug}|${comp}`),
  );

  // Track what we removed from JSON
  const removedFromJson: string[] = [];
  const removedSlugs: string[] = [];

  // Clean footy-logos.json
  for (const [comp, teams] of Object.entries(data.by_competition)) {
    const before = teams.length;
    data.by_competition[comp] = teams.filter((team) => {
      const key = `${team.slug}|${comp}`;
      if (toRemove.has(key)) {
        removedFromJson.push(`${team.team_name} (${comp})`);
        removedSlugs.push(team.slug);
        return false;
      }
      return true;
    });
    const removed = before - data.by_competition[comp].length;
    if (removed > 0) {
      console.log(`  ${comp}: removed ${removed} duplicate(s)`);
    }
  }

  console.log(`\nTotal removed from JSON: ${removedFromJson.length}`);
  removedFromJson.forEach((name) => console.log(`  - ${name}`));

  // Write updated footy-logos.json
  if (!dryRun) {
    await writeFile(LOGOS_JSON, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log('\nWrote updated footy-logos.json');
  }

  // Clean Supabase question_pool
  if (removedSlugs.length === 0) {
    console.log('\nNo slugs to remove from Supabase.');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Fetch all LOGO_QUIZ rows and find ones matching removed slugs
  const PAGE_SIZE = 1000;
  let allRows: Array<{ id: string; question: { meta?: { slug?: string } } }> = [];
  let offset = 0;
  while (true) {
    const { data: page, error } = await supabase
      .from('question_pool')
      .select('id, question')
      .eq('category', 'LOGO_QUIZ')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('Supabase fetch error:', error.message);
      process.exit(1);
    }
    if (!page || page.length === 0) break;
    allRows = allRows.concat(page as any);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`\nFetched ${allRows.length} LOGO_QUIZ rows from question_pool`);

  const slugSet = new Set(removedSlugs);
  const idsToDelete = allRows
    .filter((row) => slugSet.has(row.question?.meta?.slug ?? ''))
    .map((row) => row.id);

  console.log(`Found ${idsToDelete.length} question_pool rows to delete (${idsToDelete.length / 3} teams x 3 difficulties)`);

  if (idsToDelete.length === 0) {
    console.log('No rows to delete.');
    return;
  }

  if (dryRun) {
    console.log('Dry run — not deleting from Supabase.');
    return;
  }

  // Delete in batches of 100
  let deleted = 0;
  const batchSize = 100;
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const { error } = await supabase.from('question_pool').delete().in('id', batch);
    if (error) {
      console.error(`Delete error at batch ${i}:`, error.message);
      process.exit(1);
    }
    deleted += batch.length;
  }

  console.log(`Deleted ${deleted} rows from question_pool`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
