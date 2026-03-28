/**
 * Seed Logo Quiz questions with COMPOSITE difficulty scoring.
 *
 * Formula: question_elo = 600 + (240 * erasure) + (560 * league_score) + (800 * team_score)
 *
 * Three factors:
 *   1. Erasure level (15% weight): how much of the logo is hidden
 *   2. League popularity (35% weight): how famous the competition is
 *   3. Team popularity (50% weight): how recognizable the team is
 *
 * Creates 3 questions per team (easy/medium/hard erasure), each with a unique question_elo.
 *
 * Usage: npx ts-node scripts/seed-logo-composite-difficulty.ts [--dry-run]
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOGOS_JSON = path.join(__dirname, '..', '..', 'footy-logos.json');

// ─── League Tiers (4 tiers for better granularity) ───────────────
const LEAGUE_TIERS: Record<string, number> = {
  // TIER 1 (0.0) — Global elite
  'premier-league': 0.0,
  'laliga': 0.0,
  'serie-a': 0.0,
  'bundesliga': 0.0,
  'ligue-1': 0.0,
  'uefa-champions-league': 0.0,
  'fifa-world-cup-2026': 0.0,
  'fifa-world-cup-editions': 0.0,

  // TIER 2 (0.33) — Well-known
  'eredivisie': 0.33,
  'liga-portugal': 0.33,
  'super-lig': 0.33,
  'efl-championship': 0.33,
  'europa-league': 0.33,
  'brasileirao-serie-a': 0.33,
  'liga-mx': 0.33,
  'mls': 0.33,
  'saudi-pro-league': 0.33,
  'scottish-premiership': 0.33,
  'belgian-pro-league': 0.33,
  'swiss-super-league': 0.33,
  'austrian-bundesliga': 0.33,
  'superliga-denmark': 0.33,
  'russian-premier-league': 0.33,
  'ukrainian-premier-league': 0.33,
  'super-league-greece': 0.33,
  'copa-libertadores': 0.33,
  'ekstraklasa': 0.33,
  'supersport-hnl': 0.33,
  'world-cup-2026-qualifiers': 0.33,
  'laliga-2': 0.33,
  'bundesliga-2': 0.33,
  'serie-b': 0.33,
  'ligue-2': 0.33,
  'k-league-1': 0.33,

  // TIER 3 (0.67) — Niche but real
  'brasileirao-serie-b': 0.67,
  'efl-league-one': 0.67,
  'efl-league-two': 0.67,
  'allsvenskan': 0.67,
  'eliteserien': 0.67,
  'liga-profesional': 0.67,
  'primera-division-uruguay': 0.67,
  'chinese-super-league': 0.67,
  'j1-league': 0.67,
  'a-league-men': 0.67,
  'indian-super-league': 0.67,
  'egyptian-premier-league': 0.67,
  'israeli-premier-league': 0.67,
  'chance-liga': 0.67,
  'veikkausliiga': 0.67,
  'categoria-primera-a': 0.67,
  'leiga-de-primera-chile': 0.67,
  'indonesian-super-league': 0.67,
  'eerste-divisie': 0.67,
  'ligapro-serie-a': 0.67,
  'primera-division-paraguay': 0.67,

  // TIER 4 (1.0) — Everything not listed above
  // 3-liga, armenian-premier-league, besta-deild, botola-pro-1,
  // canadian-premier-league, cyprus-league, kategoria-superiore,
  // league-of-ireland, premier-league-azerbaijan, primera-divisio-andorra,
  // usl-championship
};

function getLeagueScore(competition: string): number {
  return LEAGUE_TIERS[competition] ?? 1.0;
}

// ─── Team Popularity Lookup ──────────────────────────────────────
// FAMOUS (0.0): Globally iconic — any casual fan recognizes these
const FAMOUS_TEAMS = new Set([
  // Premier League
  'manchester-united', 'liverpool-fc', 'manchester-city', 'chelsea', 'arsenal',
  'tottenham-hotspur', 'tottenham',
  // La Liga
  'fc-barcelona', 'atletico-madrid',
  // Serie A
  'juventus', 'ac-milan', 'inter-milan', 'napoli', 'as-roma',
  // Bundesliga
  'bayern-munich', 'borussia-dortmund',
  // Ligue 1
  'paris-saint-germain-psg',
  // Eredivisie
  'ajax',
  // Portugal
  'sl-benfica', 'benfica',
  // Turkey
  'galatasaray',
  // Scotland
  'celtic',
  // South America
  'boca-juniors', 'flamengo', 'palmeiras', 'corinthians',
  // Champions League aliases
  'psg', 'dortmund',
  // National teams
  'brazil-national-team', 'argentina-national-team', 'france-national-team',
  'germany-national-team', 'england-national-team', 'spain-national-team',
  'portugal-national-team', 'netherlands-national-team-dutch', 'netherlands',
  'italy-national-team',
]);

// KNOWN (0.4): Football fans know these, casual fans might not
const KNOWN_TEAMS = new Set([
  // Premier League
  'wolverhampton-wanderers', 'everton', 'newcastle-united', 'aston-villa',
  'west-ham-united', 'west-ham', 'crystal-palace', 'leicester-city',
  'fulham', 'brighton-and-hove-albion', 'brighton-hove-albion', 'brentford',
  'afc-bournemouth', 'leeds-united', 'sunderland', 'burnley',
  // La Liga
  'sevilla-fc', 'real-sociedad', 'villarreal-cf', 'athletic-club-bilbao',
  'athletic-bilbao', 'real-betis', 'valencia-cf',
  // Serie A
  'lazio', 'fiorentina', 'atalanta', 'torino', 'genoa',
  // Bundesliga
  'rb-leipzig', 'bayer-leverkusen', 'eintracht-frankfurt', 'vfl-wolfsburg',
  'borussia-monchengladbach', 'monchengladbach', 'vfb-stuttgart', 'werder-bremen',
  'sc-freiburg', 'hamburger-sv', 'hamburger',
  // Ligue 1
  'olympique-de-marseille-om', 'olympique-de-marseille', 'lyon-ol',
  'as-monaco', 'monaco', 'lille-losc', 'stade-rennais', 'rennes', 'rc-lens',
  // Eredivisie
  'psv-eindhoven', 'psv', 'feyenoord', 'az-alkmaar',
  // Portugal
  'sporting-cp', 'sporting', 'fc-porto', 'porto',
  // Turkey
  'besiktas', 'fenerbahce', 'trabzonspor',
  // Scotland
  'rangers',
  // Belgium
  'club-brugge', 'anderlecht',
  // South America
  'santos-fc', 'gremio', 'sc-internacional', 'sao-paulo-fc',
  'fluminense', 'botafogo', 'atletico-mineiro', 'cruzeiro',
  'river-plate', 'penarol', 'nacional', 'nacional-uruguay',
  // National teams
  'belgium-national-team', 'croatia-national-team', 'uruguay-national-team',
  'colombia-national-team', 'mexico-national-team', 'usa-national-team',
  'japan-national-team', 'south-korea-national-team', 'morocco-national-team',
  'senegal-national-team', 'switzerland-national-team', 'swizterland',
  'austria-national-team', 'scotland-national-team', 'norway-national-team',
  // Champions League aliases
  'marseille', 'copenhagen', 'bodo-glimt',
]);

function getTeamScore(slug: string, leagueScore: number): number {
  if (FAMOUS_TEAMS.has(slug)) return 0.0;
  if (KNOWN_TEAMS.has(slug)) return 0.4;

  // Default based on league tier
  if (leagueScore === 0.0) return 0.5;   // Unknown team in top league
  if (leagueScore === 0.33) return 0.7;  // Unknown team in tier 2
  if (leagueScore === 0.67) return 0.85; // Unknown team in tier 3
  return 1.0;                             // Unknown team in tier 4
}

// ─── Erasure levels ──────────────────────────────────────────────
const ERASURE_LEVELS = [
  { key: 'easy', field: 'image_url', score: 0.0 },
  { key: 'medium', field: 'medium_image_url', score: 0.5 },
  { key: 'hard', field: 'hard_image_url', score: 1.0 },
] as const;

// ─── Formula ─────────────────────────────────────────────────────
/// Weights: erasure 15%, league 35%, team 50% (team familiarity is the strongest factor)
function computeQuestionElo(erasure: number, leagueScore: number, teamScore: number): number {
  return Math.round(600 + (240 * erasure) + (560 * leagueScore) + (800 * teamScore));
}

function elotoDifficulty(elo: number): 'EASY' | 'MEDIUM' | 'HARD' {
  if (elo < 1000) return 'EASY';
  if (elo < 1500) return 'MEDIUM';
  return 'HARD';
}

const POINTS: Record<string, number> = { EASY: 10, MEDIUM: 20, HARD: 30 };

// ─── Types ───────────────────────────────────────────────────────
interface TeamLogo {
  team_name: string;
  slug: string;
  real_image_url: string;
  image_url?: string | null;
  medium_image_url?: string | null;
  hard_image_url?: string | null;
  league?: string;
  country?: string;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\nSeed Logo Quiz — Composite Difficulty (dry-run: ${dryRun})\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const data = JSON.parse(fs.readFileSync(LOGOS_JSON, 'utf-8'));

  // Step 1: Delete existing LOGO_QUIZ questions
  if (!dryRun) {
    console.log('  Deleting existing LOGO_QUIZ questions...');
    let totalDeleted = 0;
    while (true) {
      const { data: batch, error } = await supabase
        .from('question_pool')
        .delete()
        .eq('category', 'LOGO_QUIZ')
        .limit(500)
        .select('id');
      if (error) { console.error('  Delete error:', error.message); break; }
      if (!batch || batch.length === 0) break;
      totalDeleted += batch.length;
    }
    console.log(`  Deleted: ${totalDeleted} old questions`);
  }

  // Step 2: Build questions — 3 per team (one per erasure level)
  // Dedup: if same slug in multiple competitions, keep the most popular version
  const allRows: any[] = [];
  const seenSlugs = new Map<string, { leagueScore: number; indices: number[] }>();
  const stats = { total: 0, easy: 0, medium: 0, hard: 0, skipped: 0, deduped: 0 };
  const eloDistribution: number[] = [];

  for (const [comp, teams] of Object.entries(data.by_competition)) {
    const leagueScore = getLeagueScore(comp);

    for (const team of teams as TeamLogo[]) {
      // Skip league-level entries (slug matches competition slug)
      if (team.slug === comp || team.slug.endsWith('-' + comp.split('-')[0])) {
        // Check if this is actually a league icon, not a team
        const nameLC = team.team_name.toLowerCase();
        if (nameLC.includes('league') || nameLC.includes('liga') ||
            nameLC.includes('serie') || nameLC.includes('ligue') ||
            nameLC.includes('bundesliga') || nameLC.includes('premier league') ||
            nameLC.includes('eredivisie') || nameLC.includes('cup')) {
          stats.skipped++;
          continue;
        }
      }

      // Must have at least the easy erasure
      if (!team.image_url || !team.image_url.includes('supabase.co')) {
        stats.skipped++;
        continue;
      }

      const teamScore = getTeamScore(team.slug, leagueScore);

      // Dedup: keep version from most popular competition
      const existing = seenSlugs.get(team.slug);
      if (existing) {
        if (leagueScore < existing.leagueScore) {
          // This competition is more popular — replace
          for (const idx of existing.indices) allRows[idx] = null;
          stats.deduped += existing.indices.length;
        } else {
          stats.deduped++;
          continue;
        }
      }

      const indices: number[] = [];

      for (const erasure of ERASURE_LEVELS) {
        const imageUrl = (team as any)[erasure.field];
        if (!imageUrl || !imageUrl.includes('supabase.co')) continue;

        const questionElo = computeQuestionElo(erasure.score, leagueScore, teamScore);
        const difficulty = elotoDifficulty(questionElo);
        eloDistribution.push(questionElo);

        const idx = allRows.length;
        indices.push(idx);

        allRows.push({
          category: 'LOGO_QUIZ',
          difficulty,
          used: false,
          question_elo: questionElo,
          question: {
            id: randomUUID(),
            question_text: 'Identify this football club from its logo',
            correct_answer: team.team_name,
            explanation: `This is the logo of ${team.team_name}`,
            category: 'LOGO_QUIZ',
            difficulty,
            points: POINTS[difficulty],
            image_url: imageUrl,
            erasure_level: erasure.key,
            fifty_fifty_hint: null,
            fifty_fifty_applicable: false,
            meta: {
              slug: team.slug,
              league: team.league ?? comp,
              competition: comp,
              country: team.country ?? '',
              original_image_url: team.real_image_url,
              team_popularity: teamScore,
              league_popularity: leagueScore,
              erasure_level: erasure.key,
            },
          },
        });

        stats.total++;
        if (difficulty === 'EASY') stats.easy++;
        else if (difficulty === 'MEDIUM') stats.medium++;
        else stats.hard++;
      }

      seenSlugs.set(team.slug, { leagueScore, indices });
    }
  }

  // Filter out nulled-out entries
  const finalRows = allRows.filter(Boolean);

  // Distribution stats
  eloDistribution.sort((a, b) => a - b);
  const p10 = eloDistribution[Math.floor(eloDistribution.length * 0.1)];
  const p25 = eloDistribution[Math.floor(eloDistribution.length * 0.25)];
  const p50 = eloDistribution[Math.floor(eloDistribution.length * 0.5)];
  const p75 = eloDistribution[Math.floor(eloDistribution.length * 0.75)];
  const p90 = eloDistribution[Math.floor(eloDistribution.length * 0.9)];

  console.log(`\n  Questions to seed: ${finalRows.length}`);
  console.log(`    EASY  (< 1000):  ${stats.easy}`);
  console.log(`    MEDIUM (1000-1499): ${stats.medium}`);
  console.log(`    HARD  (>= 1500): ${stats.hard}`);
  console.log(`    Skipped: ${stats.skipped}`);
  console.log(`    Deduped: ${stats.deduped}`);
  console.log(`\n  ELO Distribution:`);
  console.log(`    Min: ${eloDistribution[0]}  Max: ${eloDistribution[eloDistribution.length - 1]}`);
  console.log(`    P10: ${p10}  P25: ${p25}  P50: ${p50}  P75: ${p75}  P90: ${p90}`);

  // Show examples at different ELO ranges
  const examples = [
    { label: 'Easiest (ELO < 800)', filter: (r: any) => r.question_elo < 800 },
    { label: 'Mid-Easy (800-1100)', filter: (r: any) => r.question_elo >= 800 && r.question_elo < 1100 },
    { label: 'Mid (1100-1500)', filter: (r: any) => r.question_elo >= 1100 && r.question_elo < 1500 },
    { label: 'Hard (1500-1900)', filter: (r: any) => r.question_elo >= 1500 && r.question_elo < 1900 },
    { label: 'Hardest (>= 1900)', filter: (r: any) => r.question_elo >= 1900 },
  ];

  for (const ex of examples) {
    const matches = finalRows.filter(ex.filter);
    const sample = matches.slice(0, 3).map(
      (r: any) => `${r.question.correct_answer} [${r.question.meta.erasure_level}] (${r.question_elo})`
    );
    console.log(`\n  ${ex.label} (${matches.length} questions):`);
    console.log(`    ${sample.join(', ')}`);
  }

  if (dryRun) {
    console.log('\n  Dry run — not inserting.\n');
    return;
  }

  // Step 3: Insert in batches
  let inserted = 0;
  const batchSize = 100;
  for (let i = 0; i < finalRows.length; i += batchSize) {
    const batch = finalRows.slice(i, i + batchSize);
    const { error } = await supabase.from('question_pool').insert(batch);
    if (error) {
      console.error(`  Insert error at ${i}: ${error.message}`);
      continue;
    }
    inserted += batch.length;
  }

  console.log(`\n  Seeded: ${inserted} questions`);

  // Verify
  const { count } = await supabase
    .from('question_pool')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'LOGO_QUIZ');
  console.log(`  Verified in DB: ${count}\n`);

  // Step 4: Write back popularity scores to footy-logos.json
  let updated = 0;
  for (const [comp, teams] of Object.entries(data.by_competition)) {
    const leagueScore = getLeagueScore(comp);
    for (const team of teams as any[]) {
      const teamScore = getTeamScore(team.slug, leagueScore);
      team.team_popularity = teamScore;
      team.league_popularity = leagueScore;
      updated++;
    }
  }
  fs.writeFileSync(LOGOS_JSON, JSON.stringify(data, null, 2) + '\n');
  console.log(`  Updated ${updated} entries in footy-logos.json with popularity scores\n`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
