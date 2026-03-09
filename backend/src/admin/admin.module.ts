import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { QuestionsModule } from '../questions/questions.module';
import { BlitzModule } from '../blitz/blitz.module';

@Module({
  imports: [QuestionsModule, BlitzModule],
  controllers: [AdminController],
})
export class AdminModule {}
