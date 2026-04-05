import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    // No lazyConnect — eager connect at startup so TLS handshake (Upstash) happens once,
    // not on the first real request. maxRetriesPerRequest: null lets ioredis retry indefinitely
    // on connection errors rather than failing commands immediately.
    this.client = new Redis(url, { maxRetriesPerRequest: null });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('connect', () => this.logger.debug('Redis connected'));
  }

  async onModuleInit() {
    try {
      await this.client.ping();
      this.logger.debug('Redis ping OK');
    } catch (err) {
      this.logger.error(`Redis ping failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds !== undefined) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  async flush(): Promise<void> {
    await this.client.flushdb();
  }

  /**
   * Acquires a distributed lock using SET NX EX.
   * Returns true if the lock was acquired, false if already held.
   */
  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(lockKey: string): Promise<void> {
    await this.client.del(lockKey);
  }
}
