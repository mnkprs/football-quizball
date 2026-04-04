import { IsOptional, IsString, IsNumberString, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class PoolQuestionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseFloat(value ?? '0'))
  min?: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value ?? '0.1'))
  max?: number = 0.1;

  @IsOptional()
  @Transform(({ value }) => Math.max(1, parseInt(value ?? '1', 10)))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Math.min(100, Math.max(1, parseInt(value ?? '20', 10))))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ?? '').trim() || undefined)
  search?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ?? '').trim() || undefined)
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ?? '').trim() || undefined)
  difficulty?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ?? '').trim() || undefined)
  generation_version?: string;
}
