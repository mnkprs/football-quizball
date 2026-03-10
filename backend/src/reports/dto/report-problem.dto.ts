import { IsString, IsOptional, IsBoolean, IsNumber, IsObject, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ReportProblemDto {
  @IsString()
  questionId: string;

  @IsOptional()
  @IsString()
  gameId?: string;

  @IsString()
  @MaxLength(100)
  category: string;

  @IsString()
  @MaxLength(20)
  difficulty: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  points: number;

  @IsString()
  @MaxLength(2000)
  questionText: string;

  @IsOptional()
  @IsBoolean()
  fiftyFiftyApplicable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
