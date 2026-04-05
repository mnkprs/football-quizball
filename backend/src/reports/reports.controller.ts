import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportProblemDto } from './dto/report-problem.dto';

@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('problem')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reportProblem(@Body() dto: ReportProblemDto): Promise<void> {
    await this.reportsService.reportProblem(dto);
  }
}
