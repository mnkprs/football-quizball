import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SessionStoreService {
  constructor(private readonly redisService: RedisService) {}

  get<T>(key: string): Promise<T | undefined> {
    return this.redisService.get<T>(key);
  }

  set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    return this.redisService.set(key, value, ttlSeconds);
  }

  del(key: string): Promise<void> {
    return this.redisService.del(key);
  }
}
