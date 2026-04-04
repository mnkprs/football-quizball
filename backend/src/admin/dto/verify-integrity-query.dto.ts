import { IsOptional, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyIntegrityQueryDto {
  @IsOptional()
  @Transform(({ value }) => Math.min(1000, Math.max(1, parseInt(value ?? '100', 10) || 100)))
  limit?: number = 100;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ?? '').trim().toUpperCase() || undefined)
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ?? '').trim() || undefined)
  version?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  apply?: boolean = false;
}

export class VerifyIntegrityBodyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];
}
