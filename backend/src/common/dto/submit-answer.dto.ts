import { IsString, MaxLength } from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  @MaxLength(500)
  answer: string;
}
