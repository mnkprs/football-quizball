import { Injectable } from '@nestjs/common';
import NodeCache from 'node-cache';

@Injectable()
export class CacheService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    if (ttl !== undefined) {
      return this.cache.set(key, value, ttl);
    }
    return this.cache.set(key, value);
  }

  del(key: string): number {
    return this.cache.del(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  flush(): void {
    this.cache.flushAll();
  }
}
