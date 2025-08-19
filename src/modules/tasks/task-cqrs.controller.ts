import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CQRSMediator } from '../../application/cqrs/cqrs-mediator';

// Commands
import {
  CreateTaskCommand,
  UpdateTaskCommand,
  ChangeTaskStatusCommand,
  DeleteTaskCommand,
  AssignTaskCommand,
  BulkUpdateTaskStatusCommand
} from '../../application/services/task-command.service';

// Queries
import {
  GetTaskByIdQuery,
  GetTasksQuery,
  GetUserTasksQuery,
  GetOverdueTasksQuery,
  GetTaskStatisticsQuery,
  SearchTasksQuery,
  GetHighPriorityTasksQuery
} from '../../application/services/task-query.service';

// DTOs
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';
import { TaskFilterDto } from '../tasks/dto/task-filter.dto';
import { TaskStatus, TaskPriority } from '../../domain/entities/task.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';

/**
 * CQRS-based Task Controller
 * Demonstrates the separation of commands and queries
 */
@ApiTags('Tasks (CQRS)')
@Controller('api/v2/tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaskCQRSController {
  constructor(private readonly mediator: CQRSMediator) {}

  /**
   * Create a new task using CQRS command
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new task (CQRS)' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async createTask(
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: any
  ) {
    const command = new CreateTaskCommand(
      createTaskDto.title,
      createTaskDto.description || '',
      createTaskDto.priority as TaskPriority,
      createTaskDto.dueDate ? new Date(createTaskDto.dueDate) : new Date(),
      createTaskDto.userId,
      user.id
    );

    const result = await this.mediator.send(command);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Get all tasks using CQRS query
   */
  @Get()
  @ApiOperation({ summary: 'Get all tasks with filters (CQRS)' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  async getTasks(@Query() filterDto: TaskFilterDto, @CurrentUser() user: any) {
    const query = new GetTasksQuery(
      {
        status: filterDto.status as TaskStatus,
        priority: filterDto.priority as TaskPriority,
        userId: filterDto.userId ? EntityId.fromString(filterDto.userId) : undefined,
        search: filterDto.search,
        dueDateStart: filterDto.dueDateStart ? new Date(filterDto.dueDateStart) : undefined,
        dueDateEnd: filterDto.dueDateEnd ? new Date(filterDto.dueDateEnd) : undefined,
        createdAtStart: filterDto.createdAtStart ? new Date(filterDto.createdAtStart) : undefined,
        createdAtEnd: filterDto.createdAtEnd ? new Date(filterDto.createdAtEnd) : undefined
      },
      {
        page: filterDto.page || 1,
        limit: filterDto.limit || 10,
        sortBy: filterDto.sortBy || 'createdAt',
        sortOrder: (filterDto.sortOrder as 'ASC' | 'DESC') || 'DESC'
      },
      user.id
    );

    const result = await this.mediator.query(query);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Get task by ID using CQRS query
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID (CQRS)' })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getTaskById(@Param('id') id: string, @CurrentUser() user: any) {
    const query = new GetTaskByIdQuery(id, user.id);
    const result = await this.mediator.query(query);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Update task using CQRS command
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update task (CQRS)' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async updateTask(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: any
  ) {
    const command = new UpdateTaskCommand(
      id,
      updateTaskDto.title,
      updateTaskDto.description,
      updateTaskDto.priority as TaskPriority,
      updateTaskDto.dueDate ? new Date(updateTaskDto.dueDate) : undefined,
      user.id
    );

    const result = await this.mediator.send(command);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Change task status using CQRS command
   */
  @Put(':id/status')
  @ApiOperation({ summary: 'Change task status (CQRS)' })
  @ApiResponse({ status: 200, description: 'Task status updated successfully' })
  async changeTaskStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: any
  ) {
    const command = new ChangeTaskStatusCommand(
      id,
      status as TaskStatus,
      user.id
    );

    const result = await this.mediator.send(command);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Delete task using CQRS command
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete task (CQRS)' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async deleteTask(@Param('id') id: string, @CurrentUser() user: any) {
    const command = new DeleteTaskCommand(id, user.id);
    const result = await this.mediator.send(command);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      metadata: result.metadata
    };
  }

  /**
   * Get user's tasks using CQRS query
   */
  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user tasks (CQRS)' })
  async getUserTasks(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
    @Query('status') status?: string
  ) {
    const query = new GetUserTasksQuery(
      userId,
      status as TaskStatus,
      { page: 1, limit: 100 }
    );

    const result = await this.mediator.query(query);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Get overdue tasks using CQRS query
   */
  @Get('overdue/list')
  @ApiOperation({ summary: 'Get overdue tasks (CQRS)' })
  async getOverdueTasks(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    const query = new GetOverdueTasksQuery(
      userId,
      { page: page || 1, limit: limit || 10 }
    );

    const result = await this.mediator.query(query);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Get task statistics using CQRS query
   */
  @Get('statistics/summary')
  @ApiOperation({ summary: 'Get task statistics (CQRS)' })
  async getTaskStatistics(
    @CurrentUser() user: any,
    @Query('userId') userId?: string
  ) {
    const query = new GetTaskStatisticsQuery(userId);
    const result = await this.mediator.query(query);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Search tasks using CQRS query
   */
  @Get('search/:searchTerm')
  @ApiOperation({ summary: 'Search tasks (CQRS)' })
  async searchTasks(
    @Param('searchTerm') searchTerm: string,
    @Query() filterDto: Partial<TaskFilterDto>,
    @CurrentUser() user: any
  ) {
    // Convert filterDto to proper format
    const filters = {
      ...filterDto,
      userId: filterDto.userId ? EntityId.fromString(filterDto.userId) : undefined,
      dueDateStart: filterDto.dueDateStart ? new Date(filterDto.dueDateStart) : undefined,
      dueDateEnd: filterDto.dueDateEnd ? new Date(filterDto.dueDateEnd) : undefined,
      createdAtStart: filterDto.createdAtStart ? new Date(filterDto.createdAtStart) : undefined,
      createdAtEnd: filterDto.createdAtEnd ? new Date(filterDto.createdAtEnd) : undefined
    };

    const query = new SearchTasksQuery(
      searchTerm,
      filters,
      {
        page: filterDto.page || 1,
        limit: filterDto.limit || 10
      },
      user.id
    );

    const result = await this.mediator.query(query);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Assign task to user using CQRS command
   */
  @Put(':id/assign')
  @ApiOperation({ summary: 'Assign task to user (CQRS)' })
  async assignTask(
    @Param('id') id: string,
    @Body('newUserId') newUserId: string,
    @CurrentUser() user: any
  ) {
    const command = new AssignTaskCommand(id, newUserId, user.id);
    const result = await this.mediator.send(command);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Bulk update task status using CQRS command
   */
  @Put('bulk/status')
  @ApiOperation({ summary: 'Bulk update task status (CQRS)' })
  async bulkUpdateTaskStatus(
    @Body() body: { taskIds: string[]; status: string },
    @CurrentUser() user: any
  ) {
    const command = new BulkUpdateTaskStatusCommand(
      body.taskIds,
      body.status as TaskStatus,
      user.id
    );

    const result = await this.mediator.send(command);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Get high priority tasks using CQRS query
   */
  @Get('user/:userId/high-priority')
  @ApiOperation({ summary: 'Get user high priority tasks (CQRS)' })
  async getHighPriorityTasks(
    @Param('userId') userId: string,
    @CurrentUser() user: any
  ) {
    const query = new GetHighPriorityTasksQuery(userId);
    const result = await this.mediator.query(query);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }
}
