import { Module } from '@nestjs/common';
import { SessionStoreService } from './session-store.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [SessionStoreService],
  exports: [SessionStoreService],
})
export class SessionStoreModule {}
