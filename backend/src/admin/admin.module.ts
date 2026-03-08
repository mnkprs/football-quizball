import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [QuestionsModule],
  controllers: [AdminController],
})
export class AdminModule {}
