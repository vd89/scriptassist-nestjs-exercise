import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsString,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for filtering and paginating tasks
 * Properly defined with validation rules
 */
export class TaskFilterDto {
  @ApiProperty({ enum: TaskStatus, required: false, description: 'Filter by task status' })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ enum: TaskPriority, required: false, description: 'Filter by task priority' })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ required: false, description: 'Filter by user ID' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({ required: false, description: 'Search in title and description' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter by due date (start)' })
  @IsDateString()
  @IsOptional()
  dueDateStart?: string;

  @ApiProperty({ required: false, description: 'Filter by due date (end)' })
  @IsDateString()
  @IsOptional()
  dueDateEnd?: string;

  @ApiProperty({ required: false, description: 'Filter by created date (start)' })
  @IsDateString()
  @IsOptional()
  createdAtStart?: string;

  @ApiProperty({ required: false, description: 'Filter by created date (end)' })
  @IsDateString()
  @IsOptional()
  createdAtEnd?: string;

  // Pagination
  @ApiProperty({ required: false, default: 1, description: 'Page number (1-based)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number) // Transform string to number
  page?: number = 1;

  @ApiProperty({ required: false, default: 10, description: 'Items per page' })
  @IsInt()
  @Min(1)
  @Max(100) // Set a reasonable maximum to prevent performance issues
  @IsOptional()
  @Type(() => Number) // Transform string to number
  limit?: number = 10;

  // Sorting
  @ApiProperty({
    required: false,
    description: 'Sort field',
    enum: ['title', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'],
  })
  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @ApiProperty({ required: false, description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
