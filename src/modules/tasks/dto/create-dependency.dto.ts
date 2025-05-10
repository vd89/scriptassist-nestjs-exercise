import { IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDependencyDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  dependentTaskId: string;

  @ApiProperty({ enum: ['BLOCKS', 'BLOCKED_BY', 'RELATES_TO'] })
  @IsEnum(['BLOCKS', 'BLOCKED_BY', 'RELATES_TO'])
  type: 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO';
}
