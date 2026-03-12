import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { WebSearchModule } from '../web-search/web-search.module';

@Module({
  imports: [WebSearchModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
