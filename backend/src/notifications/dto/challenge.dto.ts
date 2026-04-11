import { IsString, IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class ChallengeDto {
  @IsUUID()
  targetUserId: string;

  @IsString()
  @IsIn(['standard', 'logo'])
  gameType: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  message?: string;
}
