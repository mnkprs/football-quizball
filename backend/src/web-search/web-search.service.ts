import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tavily } from '@tavily/core';

export interface WebSearchResult {
  query: string;
  results: Array<{ title: string; url: string; content: string }>;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly client: ReturnType<typeof tavily> | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('TAVILY_API_KEY');
    if (apiKey) {
      this.client = tavily({ apiKey });
      this.logger.log('WebSearchService ready — Tavily API enabled');
    } else {
      this.logger.warn('TAVILY_API_KEY not set — web search disabled');
    }
  }

  get hasWebSearch(): boolean {
    return !!this.client;
  }

  /**
   * Searches the web for real-time information (e.g. player transfers, latest club).
   * Returns up to 5 results with title, url, and content snippet.
   */
  async search(query: string, maxResults = 5): Promise<WebSearchResult> {
    if (!this.client) {
      return { query, results: [] };
    }

    try {
      // topic: 'general' (not 'news') — better for historical match scores, career paths, stats
      const response = await this.client.search(query, {
        maxResults: Math.min(maxResults, 10),
        searchDepth: 'basic',
        topic: 'general',
        includeAnswer: false,
      });

      const results = (response.results ?? []).slice(0, maxResults).map((r: { title?: string; url?: string; content?: string }) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: r.content ?? '',
      }));

      this.logger.log(`[Tavily] search "${query}" → ${results.length} results`);
      return { query, results };
    } catch (err) {
      this.logger.error(`[search] Failed: ${(err as Error).message}`);
      return { query, results: [] };
    }
  }

  /**
   * Formats search results for injection into an LLM prompt.
   */
  formatForPrompt(result: WebSearchResult): string {
    if (result.results.length === 0) return 'No results found.';
    return result.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`)
      .join('\n\n');
  }
}
