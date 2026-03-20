import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import axios from 'axios';

@Injectable()
export class FootballApiService {
  private readonly logger = new Logger(FootballApiService.name);
  private readonly sportsDbBase = 'https://www.thesportsdb.com/api/v1/json/3';
  private readonly apiFootballBase = 'https://v3.football.api-sports.io';
  private apiFootballKey: string;

  constructor(
    private configService: ConfigService,
    private cacheService: CacheService,
  ) {
    this.apiFootballKey =
      this.configService.get<string>('API_FOOTBALL_KEY') || '';
    if (!this.apiFootballKey) {
      this.logger.warn('API_FOOTBALL_KEY not set — API-Football endpoints (top scorers, fixtures, standings) are disabled. Current generators are unaffected.');
    }
  }

  private async sportsDbGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const cacheKey = `sportsdb:${endpoint}:${JSON.stringify(params || {})}`;
    const cached = await this.cacheService.get<T>(cacheKey);
    if (cached) return cached;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url = `${this.sportsDbBase}/${endpoint}`;
        const response = await axios.get<T>(url, { params, timeout: 10000 });
        await this.cacheService.set(cacheKey, response.data, 7200);
        return response.data;
      } catch (err: any) {
        lastError = err as Error;
        if (err?.response?.status === 429 && attempt < 3) {
          const delay = 1000 * attempt;
          this.logger.warn(`TheSportsDB rate limited (429), retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.logger.error(`TheSportsDB error: ${(err as Error).message}`);
          throw err;
        }
      }
    }

    this.logger.error(`TheSportsDB error: ${lastError!.message}`);
    throw lastError;
  }

  private async apiFootballGet<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
    if (!this.apiFootballKey) {
      throw new Error('API_FOOTBALL_KEY not configured');
    }

    const cacheKey = `apifootball:${endpoint}:${JSON.stringify(params || {})}`;
    const cached = await this.cacheService.get<T>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get<T>(`${this.apiFootballBase}/${endpoint}`, {
        params,
        headers: { 'x-apisports-key': this.apiFootballKey },
        timeout: 10000,
      });
      await this.cacheService.set(cacheKey, response.data, 3600);
      return response.data;
    } catch (err) {
      this.logger.error(`API-Football error: ${(err as Error).message}`);
      throw err;
    }
  }

  // TheSportsDB methods
  async searchPlayer(name: string): Promise<any> {
    return this.sportsDbGet<any>('searchplayers.php', { p: name });
  }

  async getPlayerById(id: string): Promise<any> {
    return this.sportsDbGet<any>('lookupplayer.php', { id });
  }

  async getTeamByName(name: string): Promise<any> {
    return this.sportsDbGet<any>('searchteams.php', { t: name });
  }

  async getTeamById(id: string): Promise<any> {
    return this.sportsDbGet<any>('lookupteam.php', { id });
  }

  async getAllLeagues(): Promise<any> {
    return this.sportsDbGet<any>('all_leagues.php');
  }

  async getLeagueTeams(leagueId: string): Promise<any> {
    return this.sportsDbGet<any>('lookup_all_teams.php', { id: leagueId });
  }

  async getPlayerContracts(playerId: string): Promise<any> {
    return this.sportsDbGet<any>('lookupcontracts.php', { id: playerId });
  }

  async searchTeamPlayers(teamId: string): Promise<any> {
    return this.sportsDbGet<any>('lookup_all_players.php', { id: teamId });
  }

  // Popular leagues for variety: Premier League (4328), La Liga (4335), Bundesliga (4331), Serie A (4332), Ligue 1 (4334)
  async getPopularTeams(): Promise<any[]> {
    const leagueIds = ['4328', '4335', '4331', '4332', '4334'];
    const results = await Promise.allSettled(
      leagueIds.map((id) => this.getLeagueTeams(id)),
    );
    const teams: any[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.teams) {
        teams.push(...result.value.teams);
      }
    }
    return teams;
  }

  // API-Football methods
  async getTopScorers(leagueId: number, season: number): Promise<any> {
    return this.apiFootballGet<any>('players/topscorers', {
      league: leagueId,
      season,
    });
  }

  async getFixtures(params: Record<string, string | number>): Promise<any> {
    return this.apiFootballGet<any>('fixtures', params);
  }

  async getPlayerStats(playerId: number, season: number, leagueId: number): Promise<any> {
    return this.apiFootballGet<any>('players', {
      id: playerId,
      season,
      league: leagueId,
    });
  }

  async getStandings(leagueId: number, season: number): Promise<any> {
    return this.apiFootballGet<any>('standings', {
      league: leagueId,
      season,
    });
  }

  async verifyImageUrl(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Fetches the thumbnail image URL for a football club from Wikipedia's REST API.
   * Wikipedia page titles are stable and this is the most reliable public source for badge images.
   * Returns null if the club page has no thumbnail or the request fails.
   */
  async getWikipediaBadge(wikiTitle: string): Promise<string | null> {
    const cacheKey = `wiki:badge:${wikiTitle}`;
    const cached = await this.cacheService.get<string | null>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const encoded = encodeURIComponent(wikiTitle.replace(/ /g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
      const response = await axios.get<{ thumbnail?: { source: string } }>(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'UnlimitedQuizball/1.0 (educational quiz app; contact@quizball.app)' },
      });
      const src = response.data?.thumbnail?.source ?? null;
      await this.cacheService.set(cacheKey, src, 86400); // cache 24h
      return src;
    } catch (err) {
      this.logger.warn(`Wikipedia badge lookup failed for "${wikiTitle}": ${(err as Error).message}`);
      await this.cacheService.set(cacheKey, null, 3600);
      return null;
    }
  }
}
