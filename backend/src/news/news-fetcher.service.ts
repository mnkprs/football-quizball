import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { NewsHeadline } from '../common/interfaces/news.interface';

const BBC_FOOTBALL_RSS = 'https://feeds.bbci.co.uk/sport/football/rss.xml';
const MAX_HEADLINES = 15;

@Injectable()
export class NewsFetcherService {
  private readonly logger = new Logger(NewsFetcherService.name);

  /**
   * Fetches football headlines from BBC Sport RSS feed.
   * Returns up to MAX_HEADLINES headlines for question generation.
   */
  async fetchHeadlines(): Promise<NewsHeadline[]> {
    try {
      const { data } = await axios.get<string>(BBC_FOOTBALL_RSS, {
        timeout: 10000,
        headers: { 'User-Agent': 'FootballQuizball/1.0' },
      });

      const headlines = this.parseRssItems(data);
      this.logger.log(`[fetchHeadlines] Fetched ${headlines.length} headlines`);
      return headlines.slice(0, MAX_HEADLINES);
    } catch (err) {
      this.logger.error(`[fetchHeadlines] Failed: ${(err as Error).message}`);
      return [];
    }
  }

  private parseRssItems(xml: string): NewsHeadline[] {
    const items: NewsHeadline[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i;
    const linkRegex = /<link>(.*?)<\/link>/i;
    const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/i;

    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = block.match(titleRegex);
      const linkMatch = block.match(linkRegex);
      const pubMatch = block.match(pubDateRegex);

      const headline = titleMatch
        ? (titleMatch[1] ?? titleMatch[2] ?? '').trim()
        : '';
      const url = linkMatch ? linkMatch[1].trim() : '';
      const date = pubMatch ? new Date(pubMatch[1]) : new Date();

      if (headline && this.isFootballRelevant(headline)) {
        items.push({ headline, url, date });
      }
    }

    return items;
  }

  private isFootballRelevant(headline: string): boolean {
    const lower = headline.toLowerCase();
    const skip = ['cricket', 'rugby', 'tennis', 'golf', 'formula', 'cycling'];
    return !skip.some((s) => lower.includes(s));
  }
}
