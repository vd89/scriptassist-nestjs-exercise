import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  UseGuards,
  Query,
  BadRequestException,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Between, FindOptionsWhere, ILike, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TaskStatus } from './enums/task-status.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { IBatchRespone } from './interfaces/task.interface';
import { TaskFilterDto } from './dto/task-filter.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { User } from '@modules/users/entities/user.entity';
import { BatchTaskOperationDto } from './dto/batch-operation.dto';
import { Task } from './entities/task.entity';
import { CacheInterceptor } from '@common/interceptors/cache.interceptor';
import { Cache } from '@common/decorators/cache.decorator';
import { IdParam } from '@common/decorators/id-param.decorator';
import { ITaskStats } from './interfaces/task.interface';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@UseInterceptors(CacheInterceptor)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({ status: 201, description: 'Task successfully created', type: Task })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @Cache({ namespace: 'tasks', key: ({ user }) => user.id, expireIn: 300 })
  @ApiOperation({ summary: 'List tasks with filters and pagination' })
  @ApiQuery({ type: TaskFilterDto })
  async findAll(@Query() query: TaskFilterDto, @CurrentUser() user: User) {
    const {
      status,
      priority,
      page,
      limit,
      start_date: startDate,
      end_date: endDate,
      search,
    } = query;

    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (user.role !== 'admin') where.userId = user.id;
    if (startDate && endDate) where.dueDate = Between(startDate, endDate);
    else if (startDate) where.dueDate = MoreThanOrEqual(startDate);
    else if (endDate) where.dueDate = LessThanOrEqual(endDate);

    if (search) {
      where.or = [{ title: ILike(`%${search}%`) }, { description: ILike(`%${search}%`) }];
    }

    return this.tasksService.paginate(where, { page, limit });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics for current user or admin' })
  @ApiResponse({ status: 200, description: 'Task statistics' })
  async getStats(@CurrentUser() user: User) {
    const query: Array<[string, string]> = user.role === 'admin' ? [] : [['userId', user.id]];
    return this.tasksService.getStats(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single task by ID' })
  @ApiParam({ name: 'id', description: 'Task ID', type: String })
  @ApiResponse({ status: 200, description: 'The task', type: Task })
  @ApiResponse({ status: 403, description: 'Forbidden: Unauthorized access' })
  async findOne(@IdParam('id') id: string, @CurrentUser() user: User) {
    const task = await this.tasksService.findById(id);
    if (task.userId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You are not authorized to perform this action.');
    }
    return this.tasksService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task by ID' })
  @ApiParam({ name: 'id', description: 'Task ID', type: String })
  @ApiBody({ type: UpdateTaskDto })
  @ApiResponse({ status: 200, description: 'Task updated successfully', type: Task })
  @ApiResponse({ status: 403, description: 'Forbidden: Unauthorized access' })
  async update(
    @IdParam('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: User,
  ) {
    const task = await this.tasksService.findById(id);
    if (task.userId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You are not authorized to perform this action.');
    }
    return this.tasksService.update(task, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task by ID' })
  @ApiParam({ name: 'id', description: 'Task ID', type: String })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Unauthorized access' })
  async remove(@IdParam('id') id: string, @CurrentUser() user: User) {
    const task = await this.tasksService.findById(id);
    if (task.userId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You are not authorized to perform this action.');
    }
    return this.tasksService.remove(task.id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Perform batch actions on multiple tasks' })
  @ApiBody({
    type: BatchTaskOperationDto,
    description: 'List of task IDs and action type (complete/delete)',
  })
  @ApiResponse({ status: 200, description: 'Batch operation results', type: [Object] })
  @ApiResponse({ status: 400, description: 'Invalid action type' })
  async batchProcess(
    @Body() operations: BatchTaskOperationDto,
    @CurrentUser() user: User,
  ): Promise<IBatchRespone[]> {
    const { tasks: taskIds, action } = operations;
    const results: IBatchRespone[] = [];

    const query: FindOptionsWhere<Task> =
      user.role === 'admin' ? { id: In(taskIds) } : { id: In(taskIds), userId: user.id };

    const foundTasks = await this.tasksService.find(query);
    const foundTaskMap = new Map(foundTasks.map(task => [task.id, task]));
    const foundTaskIds = foundTasks.map(t => t.id);

    if (foundTasks.length === 0) {
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        result: null,
        error: 'Task not found or access denied',
      }));
    }

    switch (action) {
      case 'complete': {
        const originalStatusMap = new Map<string, TaskStatus>();
        for (const task of foundTasks) {
          originalStatusMap.set(task.id, task.status);
        }
        const updatedTasks = await this.tasksService.updateBatch(
          foundTaskIds,
          { status: TaskStatus.COMPLETED },
          originalStatusMap,
        );
        const updatedTasksMap = new Map(updatedTasks.map(task => [task.id, task]));
        for (const taskId of taskIds) {
          const task = updatedTasksMap.get(taskId);
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
        await this.tasksService.deleteMany(foundTaskIds);
        for (const taskId of taskIds) {
          const task = foundTaskMap.get(taskId);
          results.push({
            taskId,
            success: !!task,
            result: task || null,
            ...(task ? {} : { error: "Task doesn't exist or wasn't deleted" }),
          });
        }
        break;
      }

      default:
        throw new BadRequestException('Invalid action type');
    }

    return results;
  }
}
