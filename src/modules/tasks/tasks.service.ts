import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, In, LessThan } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { User } from '../users/entities/user.entity';

interface FindAllOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  userId?: string;
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<Task> {
    const task = this.tasksRepository.create({
      ...createTaskDto,
      userId,
    });

    const savedTask = await this.tasksRepository.save(task);

    await this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(options: FindAllOptions): Promise<PaginatedResponse<Task>> {
    const { status, priority, userId, page = 1, limit = 10 } = options;

    const where: FindOptionsWhere<Task> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (userId) where.userId = userId;

    const [tasks, total] = await this.tasksRepository.findAndCount({
      where,
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    return {
      data: tasks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, user: User): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (user.role !== 'admin' && task.userId !== user.id) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, user: User): Promise<Task> {
    const task = await this.findOne(id, user);

    const originalStatus = task.status;

    Object.assign(task, updateTaskDto);
    const updatedTask = await this.tasksRepository.save(task);

    if (originalStatus !== updatedTask.status) {
      await this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });
    }

    return updatedTask;
  }

  async remove(id: string, user: User): Promise<void> {
    const task = await this.findOne(id, user);
    await this.tasksRepository.remove(task);
  }

  async getStats(): Promise<Record<string, number>> {
    const stats = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany();

    const priorityStats = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.priority')
      .getRawMany();

    return {
      total: stats.reduce((acc, curr) => acc + parseInt(curr.count), 0),
      ...stats.reduce(
        (acc, curr) => ({ ...acc, [curr.status.toLowerCase()]: parseInt(curr.count) }),
        {},
      ),
      ...priorityStats.reduce(
        (acc, curr) => ({
          ...acc,
          [`${curr.priority.toLowerCase()}_priority`]: parseInt(curr.count),
        }),
        {},
      ),
    };
  }

  async batchProcess(operations: {
    tasks: string[];
    action: string;
  }): Promise<{ success: boolean; taskId: string; error?: string }[]> {
    const { tasks: taskIds, action } = operations;

    if (!['complete', 'delete'].includes(action)) {
      throw new Error(`Unknown action: ${action}`);
    }

    const tasks = await this.tasksRepository.findBy({ id: In(taskIds) });

    if (action === 'complete') {
      await this.tasksRepository.update({ id: In(taskIds) }, { status: TaskStatus.COMPLETED });

      await Promise.all(
        taskIds.map(taskId =>
          this.taskQueue.add('task-status-update', {
            taskId,
            status: TaskStatus.COMPLETED,
          }),
        ),
      );
    } else {
      await this.tasksRepository.remove(tasks);
    }

    return taskIds.map(taskId => ({
      success: true,
      taskId,
    }));
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.tasksRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    task.status = status;
    return this.tasksRepository.save(task);
  }

  async findOverdueTasks(limit: number, offset: number): Promise<Task[]> {
    return this.tasksRepository.find({
      where: {
        dueDate: LessThan(new Date()),
        status: TaskStatus.PENDING,
      },
      relations: ['user'],
      take: limit,
      skip: offset,
      order: {
        dueDate: 'ASC',
      },
    });
  }
}
