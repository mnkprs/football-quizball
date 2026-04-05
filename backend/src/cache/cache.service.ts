import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  constructor(private readonly redisService: RedisService) {}

  get<T>(key: string): Promise<T | undefined> {
    return this.redisService.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): Promise<void> {
    return this.redisService.set(key, value, ttl);
  }

  del(key: string): Promise<void> {
    return this.redisService.del(key);
  }

  has(key: string): Promise<boolean> {
    return this.redisService.has(key);
  }

  flush(): Promise<void> {
    return this.redisService.flush();
  }
}
