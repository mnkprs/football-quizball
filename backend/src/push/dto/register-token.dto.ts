import { IsNotEmpty, IsString, IsIn } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsIn(['ios', 'android', 'web'])
  platform!: string;
}
