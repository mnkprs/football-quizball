import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NewsFetcherService } from './news-fetcher.service';
import { NewsQuestionGenerator } from './news-question.generator';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { LlmModule } from '../llm/llm.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, LlmModule, SupabaseModule, QuestionsModule, AuthModule],
  providers: [NewsFetcherService, NewsQuestionGenerator, NewsService],
  controllers: [NewsController],
  exports: [NewsService],
})
export class NewsModule {}
