import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import { Type } from 'class-transformer';

// TODO: Implement task filtering DTO
// This DTO should be used to filter tasks by status, priority, etc.
export class TaskFilterDto {
  @ApiProperty({ enum: TaskStatus, required: false })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;
  
  @ApiProperty({ enum: TaskPriority, required: false })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;
  
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  userId?: string;
  
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  search?: string;
  
  @ApiProperty({ required: false })
  @IsISO8601()
  @IsOptional()
  startDate?: string;
  
  @ApiProperty({ required: false })
  @IsISO8601()
  @IsOptional()
  endDate?: string;
  
  @ApiProperty({ required: false, default: 1 })
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;
  
  @ApiProperty({ required: false, default: 10 })
  @Type(() => Number)
  @IsOptional()
  limit?: number = 10;
} 