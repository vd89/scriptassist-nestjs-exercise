import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { User } from '../users/entities/user.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,

    @InjectQueue('task-processing')
    private taskQueue: Queue, // BullMQ queue for background processing

    private dataSource: DataSource, // Used for wrapping DB operations in transactions
  ) {}

  /**
   * Creates a new task associated with a user.
   * - Ensures user exists before task creation.
   * - Uses a DB transaction to keep user lookup and task creation atomic.
   * - Adds a job to a BullMQ queue for async processing (e.g., notifications or logs).
   */
  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    return await this.dataSource.transaction(async manager => {
      // Validate that the user exists before creating a task
      const user = await manager.findOne(User, {
        where: { id: createTaskDto.userId },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${createTaskDto.userId} not found`);
      }

      // Create and save the new task in the database
      const task = manager.create(Task, createTaskDto);
      const savedTask = await manager.save(Task, task);

      // Enqueue background job for task status updates (e.g. notification, audit)
      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      });

      return savedTask;
    });
  }

  /**
   * Returns all tasks with related user info.
   */
  async findAll(): Promise<Task[]> {
    // Fetch tasks with their associated user entity
    return this.tasksRepository.find({
      relations: ['user'],
    });
  }

  /**
   * Fetches tasks with optional filtering by status/priority and supports pagination.
   * Optimized with a dynamic query builder and efficient pagination.
   */
  async findAllWithFilters(
    status?: string,
    priority?: string,
    page?: number,
    limit?: number,
  ) {
    const query = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user'); // Join with user table

    // Apply status filter if provided
    if (status) {
      query.andWhere('task.status = :status', { status });
    }

    // Apply priority filter if provided
    if (priority) {
      query.andWhere('task.priority = :priority', { priority });
    }

    // Set pagination defaults and apply skip/take
    page = Number(page) || 1;
    limit = Number(limit) || 10;

    query.skip((page - 1) * limit).take(limit);

    // Execute query and get both data and count in one go
    const [data, count] = await query.getManyAndCount();

    return {
      data,
      count,
      page,
      limit,
    };
  }

  /**
   * Returns task statistics using PostgreSQL filters for efficient counting.
   * Optimized to avoid multiple DB round-trips using a single raw query.
   */
  async getStatistics() {
    // Use raw SQL aggregation to get counts by status and priority in a single query
    const result = await this.tasksRepository
      .createQueryBuilder('task')
      .select([
        'COUNT(*) AS total',
        `COUNT(*) FILTER (WHERE task.status = '${TaskStatus.COMPLETED}') AS completed`,
        `COUNT(*) FILTER (WHERE task.status = '${TaskStatus.IN_PROGRESS}') AS inProgress`,
        `COUNT(*) FILTER (WHERE task.status = '${TaskStatus.PENDING}') AS pending`,
        `COUNT(*) FILTER (WHERE task.priority = '${TaskPriority.HIGH}') AS highPriority`,
      ])
      .getRawOne();

    // Convert string results into numbers for response
    return {
      total: parseInt(result.total, 10),
      completed: parseInt(result.completed, 10),
      inProgress: parseInt(result.inProgress, 10),
      pending: parseInt(result.pending, 10),
      highPriority: parseInt(result.highPriority, 10),
    };
  }

  /**
   * Returns a single task by ID with its related user.
   */
  async findOne(id: string): Promise<Task> {
    // Lookup task by ID including its related user
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  /**
   * Updates a task using a transaction.
   * Enqueues a background job if the status has changed.
   */
  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    return await this.dataSource.transaction(async manager => {
      // Retrieve the task and its user relation
      const task = await manager.findOne(Task, {
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      // Apply updates to the task
      Object.assign(task, updateTaskDto);

      // Save the updated task
      const updatedTask = await manager.save(Task, task);

      // If the status changed, enqueue a job to handle status update
      if (originalStatus !== updatedTask.status) {
        await this.taskQueue.add('task-status-update', {
          taskId: updatedTask.id,
          status: updatedTask.status,
        });
      }

      return updatedTask;
    });
  }

  /**
   * Deletes a task by ID.
   * Throws error if task does not exist.
   */
  async remove(id: string): Promise<{ message: string }> {
    // Check if task exists before deletion
    const task = await this.tasksRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Remove task from the database
    await this.tasksRepository.remove(task);

    return { message: `Task with ID ${id} has been successfully deleted.` };
  }

  /**
   * Batch processes tasks for common actions like complete/delete.
   * Optimized using `whereInIds` to perform bulk DB operations instead of looping over each task.
   */
  async batchProcessTasks(operations: { tasks: string[], action: string }) {
    const { tasks: taskIds, action } = operations;

    if (!taskIds.length) return [];

    try {
      switch (action) {
        case 'complete': {
          // Bulk update task statuses to completed
          await this.tasksRepository
            .createQueryBuilder()
            .update(Task)
            .set({ status: TaskStatus.COMPLETED })
            .whereInIds(taskIds)
            .execute();

          return taskIds.map(taskId => ({
            taskId,
            success: true,
            result: 'Marked as completed',
          }));
        }

        case 'delete': {
          // Bulk delete tasks
          await this.tasksRepository
            .createQueryBuilder()
            .delete()
            .from(Task)
            .whereInIds(taskIds)
            .execute();

          return taskIds.map(taskId => ({
            taskId,
            success: true,
            result: 'Deleted successfully',
          }));
        }

        default:
          throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      // Ensure consistent structure even when errors occur
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  /**
   * Updates only the status of a task by ID.
   * Simple, single-purpose method for more granular control.
   */
  async updateStatus(id: string, status: string): Promise<Task> {
    // Find task by ID
    const task = await this.tasksRepository.findOneBy({ id });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Update status and save
    task.status = status as TaskStatus;
    return this.tasksRepository.save(task);
  }

  /**
   * Finds all tasks by a specific status.
   * Includes user relation for context.
   */
  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Return tasks that match a specific status along with the user
    return this.tasksRepository.find({
      where: { status },
      relations: ['user'],
    });
  }
}
