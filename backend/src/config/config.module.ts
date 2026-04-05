import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [ConfigController],
})
export class AppConfigModule {}
