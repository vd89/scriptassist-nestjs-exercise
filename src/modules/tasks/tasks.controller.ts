import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Task } from '../../domain/entities/task.entity';
import { PaginatedResponse } from '../../types/pagination.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @RateLimit({ limit: 20, windowMs: 60000 }) // 20 requests per minute
  async create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: any) {
    // Automatically associate task with current user if not specified
    if (!createTaskDto.userId && user) {
      createTaskDto.userId = user.id;
    }

    const task = await this.tasksService.create(createTaskDto);

    return {
      success: true,
      data: task,
      message: 'Task created successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Return tasks list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @RateLimit({ limit: 60, windowMs: 60000 }) // 60 requests per minute
  async findAll(
    @Query() filterDto: TaskFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedResponse<Task>> {
    // Automatically filter by current user if not admin
    if (user && user.role !== 'admin' && !filterDto.userId) {
      filterDto.userId = user.id;
    }

    return this.tasksService.findAll(filterDto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  @ApiResponse({ status: 200, description: 'Return task statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @RateLimit({ limit: 20, windowMs: 60000 }) // 20 requests per minute
  async getStats(@CurrentUser() user: any) {
    // Filter stats by user if not admin
    const userId = user && user.role !== 'admin' ? user.id : undefined;

    const stats = await this.tasksService.getStats(userId);

    return {
      success: true,
      data: stats,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  @ApiResponse({ status: 200, description: 'Return the task' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @RateLimit({ limit: 100, windowMs: 60000 }) // 100 requests per minute
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    const task = await this.tasksService.findOne(id);

    // Check if user has access to this task
    if (user.role !== 'admin' && task.userId !== user.id) {
      return {
        success: false,
        message: 'You do not have permission to access this task',
      };
    }

    return {
      success: true,
      data: task,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @RateLimit({ limit: 30, windowMs: 60000 }) // 30 requests per minute
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: any,
  ) {
    // First get the task to check permissions
    const existingTask = await this.tasksService.findOne(id);

    // Check if user has access to modify this task
    if (user.role !== 'admin' && existingTask.userId !== user.id) {
      return {
        success: false,
        message: 'You do not have permission to modify this task',
      };
    }

    const task = await this.tasksService.update(id, updateTaskDto, user.id);

    return {
      success: true,
      data: task,
      message: 'Task updated successfully',
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @RateLimit({ limit: 20, windowMs: 60000 }) // 20 requests per minute
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    // First get the task to check permissions
    const existingTask = await this.tasksService.findOne(id);

    // Check if user has access to delete this task
    if (user.role !== 'admin' && existingTask.userId !== user.id) {
      return {
        success: false,
        message: 'You do not have permission to delete this task',
      };
    }

    await this.tasksService.remove(id, user.id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  @ApiResponse({ status: 200, description: 'Tasks processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @RateLimit({ limit: 10, windowMs: 60000 }) // 10 requests per minute
  async batchProcess(
    @Body() operations: { tasks: string[]; action: string },
    @CurrentUser() user: any,
  ) {
    const { tasks: taskIds, action } = operations;

    // Validate action
    const validActions = ['complete', 'delete'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        message: `Invalid action. Allowed actions: ${validActions.join(', ')}`,
      };
    }

    // Validate task IDs
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return {
        success: false,
        message: 'No task IDs provided',
      };
    }

    // For non-admin users, check if they have access to all tasks
    if (user.role !== 'admin') {
      // Get all tasks in a single query
      const tasks = await this.tasksService.findAll({
        userId: user.id,
      });

      // Create a set of accessible task IDs
      const accessibleTaskIds = new Set<string>(tasks.data.map(task => String(task.id)));

      // Check if all requested task IDs are accessible
      const unauthorizedTaskIds = taskIds.filter(id => !accessibleTaskIds.has(id));

      if (unauthorizedTaskIds.length > 0) {
        return {
          success: false,
          message: 'You do not have permission to modify some of the requested tasks',
          unauthorizedTasks: unauthorizedTaskIds,
        };
      }
    }

    // Process tasks in batch
    const results = await this.tasksService.batchProcess(taskIds, action, user.id);

    return {
      success: true,
      data: results,
      message: `Batch ${action} operation completed`,
    };
  }
}
