import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus, ValidationPipe, UsePipes, Request } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { TaskFilterDto } from './dto/task-filter.dto';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../modules/auth/guards/permissions.guard';
import { RequirePermissions } from '../../modules/auth/decorators/permissions.decorator';
import { ResourcePermission } from '../../modules/auth/constants/permissions';
import { PaginatedResponseDto } from '../../common/dto/pagination-response.dto';
import { Task } from './entities/task.entity';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task successfully created' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.CREATE_TASK)
  @UsePipes(new ValidationPipe({ transform: true }))
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  @ApiResponse({ status: 200, description: 'Tasks successfully retrieved' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.READ_TASK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async findAll(@Query() filterDto: TaskFilterDto, @Request() req: any): Promise<PaginatedResponseDto<Task>> {
    return this.tasksService.findAll(filterDto, req.user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  @ApiResponse({ status: 200, description: 'Task statistics successfully retrieved' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.READ_STATISTICS)
  async getStats() {
    return this.tasksService.getTaskStatistics();
  }

  @Get('search/name/:name')
  @ApiOperation({ summary: 'Find tasks by name (partial match)' })
  @ApiResponse({ status: 200, description: 'Tasks successfully found' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.READ_TASK)
  async findByName(@Param('name') name: string, @Request() req: any) {
    return this.tasksService.findByName(name, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  @ApiResponse({ status: 200, description: 'Task successfully found' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.READ_TASK)
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.findOne(id, req.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 200, description: 'Task successfully updated' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.UPDATE_TASK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Request() req: any) {
    return this.tasksService.update(id, updateTaskDto, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 200, description: 'Task successfully deleted' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.DELETE_TASK)
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.tasksService.remove(id, req.user);
    return { success: true };
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  @ApiResponse({ status: 200, description: 'Batch processing completed' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(ResourcePermission.UPDATE_TASK)
  async batchProcess(@Body() operations: { tasks: string[], action: string }, @Request() req: any) {
    const { tasks: taskIds, action } = operations;
    
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw new HttpException('Tasks array must not be empty', HttpStatus.BAD_REQUEST);
    }
    
    if (!['complete', 'delete'].includes(action)) {
      throw new HttpException('Invalid action. Must be "complete" or "delete"', HttpStatus.BAD_REQUEST);
    }
    
    return this.tasksService.batchProcessTasks(taskIds, action, req.user);
  }
} 