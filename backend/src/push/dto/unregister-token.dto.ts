import { IsNotEmpty, IsString } from 'class-validator';

export class UnregisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
