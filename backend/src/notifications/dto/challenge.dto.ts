import { IsString, IsIn, IsOptional } from 'class-validator';

export class ChallengeDto {
  @IsString()
  targetUserId: string;

  @IsString()
  @IsIn(['standard', 'logo'])
  gameType: string;

  @IsString()
  @IsOptional()
  message?: string;
}
