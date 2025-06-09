import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import { Type } from 'class-transformer';

export class CreateTaskDto {
  @ApiProperty({ example: 'Complete project documentation' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Add details about API endpoints and data models', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: TaskStatus, example: TaskStatus.PENDING, required: false })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ enum: TaskPriority, example: TaskPriority.MEDIUM, required: false })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ 
    example: '2023-12-31T23:59:59Z', 
    description: 'Due date in ISO 8601 format (e.g., 2023-12-31T23:59:59Z)',
    required: false 
  })
  @IsDateString()
  @ValidateIf((o) => o.dueDate !== null && o.dueDate !== undefined)
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;
} 