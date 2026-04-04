import { IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class SeedPoolQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    const n = parseInt(String(value || '100').replace(/^--/, ''), 10);
    return Number.isNaN(n) ? 100 : Math.min(500, Math.max(1, n));
  })
  target?: number = 100;
}
