import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  constructor(private redisService: RedisService) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.redisService.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    return this.redisService.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    return this.redisService.del(key);
  }

  async has(key: string): Promise<boolean> {
    return this.redisService.has(key);
  }

  async flush(): Promise<void> {
    return this.redisService.flush();
  }
}
