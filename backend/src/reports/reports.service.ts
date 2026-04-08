import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ReportProblemDto } from './dto/report-problem.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async reportProblem(dto: ReportProblemDto): Promise<void> {
    const { error } = await this.supabase.client.from('problem_reports').insert({
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

    if (error) {
      this.logger.error(`Failed to insert problem report: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to save report');
    }
  }
}
