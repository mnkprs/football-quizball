import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ReportProblemDto } from './dto/report-problem.dto';

@Injectable()
export class ReportsService {
  constructor(private supabase: SupabaseService) {}

  async reportProblem(dto: ReportProblemDto): Promise<void> {
    await this.supabase.client.from('problem_reports').insert({
      question_id: dto.questionId,
      game_id: dto.gameId ?? null,
      category: dto.category,
      difficulty: dto.difficulty,
      points: dto.points,
      question_text: dto.questionText,
      fifty_fifty_applicable: dto.fiftyFiftyApplicable ?? false,
      image_url: dto.imageUrl ?? null,
      meta: dto.meta ?? null,
    });
  }
}
