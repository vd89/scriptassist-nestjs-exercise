import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Between, ILike, LessThanOrEqual,MoreThanOrEqual, Repository } from 'typeorm';
import { TaskStatus } from './enums/task-status.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { IBatchRespone } from './interfaces/task.interface';
import { TaskFilterDto } from './dto/task-filter.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

@Get()
@ApiOperation({ summary: 'Find all tasks with optional filtering' })
@ApiQuery({ name: 'status', required: false })
@ApiQuery({ name: 'priority', required: false })
@ApiQuery({ name: 'page', required: false })
@ApiQuery({ name: 'limit', required: false })
@ApiQuery({ name: 'startDate', required: false, type: String })
@ApiQuery({ name: 'endDate', required: false, type: String })
@ApiQuery({ name: 'search', required: false, type: String })
async findAll(@Query() query: TaskFilterDto) {
  const {
    status,
    priority,
    page,
    limit,
    start_date:startDate,
    end_date: endDate,
    search,
  } = query;

  const where: Record<string, any> = {};

  if (status) where.status = status;
  if (priority) where.priority = priority;

  if (startDate && endDate) {
    where.dueDate = Between(startDate, endDate);
  } else if (startDate) {
    where.dueDate = MoreThanOrEqual(startDate);
  } else if (endDate) {
    where.dueDate = LessThanOrEqual(endDate);
  }

  if (search) {
    where.or = [
      { title: ILike(`%${search}%`) },
      { description: ILike(`%${search}%`) },
    ];
  }

  return this.tasksService.paginate(where, { page, limit });
}


  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    return this.tasksService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // No validation if task exists before update
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Param('id') id: string) {
    // No validation if task exists before removal
    // No status code returned for success
    return this.tasksService.remove(id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(
    @Body() operations: { tasks: string[]; action: 'complete' | 'delete' },
  ): Promise<IBatchRespone[]> {
    const { tasks: taskIds, action } = operations;
    const results: IBatchRespone[] = [];
        
        switch (action) {
      case 'complete': {
        const updatedTasks = await this.tasksService.updateBatch(taskIds, {
          status: TaskStatus.COMPLETED,
        });

        const updatedMap = new Map(updatedTasks.map(task => [task.id, task]));

        for (const taskId of taskIds) {
          const task = updatedMap.get(taskId);
        results.push({ 
          taskId, 
            success: !!task,
            result: task ?? null,
            ...(task ? {} : { error: "Task doesn't exist or wasn't updated" }),
          });
        }
        break;
      }

      case 'delete': {
        const deleteResults = await this.tasksService.deleteMany(taskIds);
        results.push(
          ...deleteResults.map(result => ({
            ...result,
            ...(result.success ? {} : { error: "Task doesn't exist or wasn't deleted" }),
          })),
        );
        break;
      }

      default:
        throw new BadRequestException('Invalid action type');
    }
    
    return results;
  }
} 