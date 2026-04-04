import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerationVersionQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ?? '').trim() || undefined)
  generation_version?: string;
}

export class DeleteByVersionQueryDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  apply?: boolean = false;
}
