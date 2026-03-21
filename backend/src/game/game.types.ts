import { IsString, IsOptional, IsArray, IsIn, IsBoolean, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Player, GameSession, Top5GuessResult, AnswerResult, HintResult } from '../common/interfaces/game.interface';

export type { Player, GameSession, Top5GuessResult, AnswerResult, HintResult };

export class CreateGameDto {
  @IsString()
  @MaxLength(100)
  player1Name: string;

  @IsString()
  @MaxLength(100)
  player2Name: string;

  /** NEWS question IDs to exclude (from localStorage) to avoid repeats in back-to-back games */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeNewsQuestionIds?: string[];
}

export class SubmitAnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsIn([0, 1])
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  playerIndex: 0 | 1;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}

export class UseLifelineDto {
  @IsString()
  questionId: string;

  @IsIn([0, 1])
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  playerIndex: 0 | 1;
}

export class Top5GuessDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsIn([0, 1])
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  playerIndex: 0 | 1;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}
