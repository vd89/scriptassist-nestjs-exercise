import { IsArray, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchProcessDto {
  @ApiProperty({
    description: 'Array of task IDs to process',
    example: ['task-id-1', 'task-id-2'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  tasks: string[];

  @ApiProperty({
    description: 'Action to perform on the tasks',
    enum: ['complete', 'delete'],
    example: 'complete',
  })
  @IsEnum(['complete', 'delete'], {
    message: 'action must be either "complete" or "delete"',
  })
  action: 'complete' | 'delete';
}
