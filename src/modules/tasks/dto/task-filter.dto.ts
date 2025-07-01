import { IsOptional, IsEnum, IsInt, Min, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export class TaskFilterDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({default: ""})
  @IsOptional()
  @IsString()
  search?: string

@ApiPropertyOptional({
    description: 'Start date of the range (inclusive)',
    example: '2025-01-01',
    default: null,
  })
  @IsOptional()
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional({
    description: 'End date of the range (inclusive)',
    example: '2025-01-31',
    default: null,
  })
  @IsOptional()
  @IsDateString()
  end_date: string;
}
 