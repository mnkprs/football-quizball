import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { GeminiImageService } from './gemini-image.service';

@Module({
  providers: [LlmService, GeminiImageService],
  exports: [LlmService, GeminiImageService],
})
export class LlmModule {}
