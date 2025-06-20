import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { IPaginatedResult, IPaginationOptions, ITaskStats } from './interfaces/task.interface';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Inefficient implementation: creates the task but doesn't use a single transaction
    // for creating and adding to queue, potential for inconsistent state
    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    // Add to queue without waiting for confirmation or handling errors
    this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(): Promise<Task[]> {
    // Inefficient implementation: retrieves all tasks without pagination
    // and loads all relations, causing potential performance issues
    return this.tasksRepository.find({
      relations: ['user'],
    });
  }

  async find(where: Record<string, any> = {}) {
    return this.tasksRepository.find({
      where,
    });
  }

  async paginate(
    where: Record<string, any>,
    options: IPaginationOptions,
  ): Promise<IPaginatedResult<Task>> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;
    const [result, total] = await this.tasksRepository.findAndCount({
      where,
      take: limit,
      skip,
    });
    return {
      data: result,
      meta: {
        total,
        currentPage: page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Task> {
    // Inefficient implementation: two separate database calls
    const count = await this.tasksRepository.count({ where: { id } });

    if (count === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return (await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    })) as Task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const taskRepo = queryRunner.manager.getRepository(Task);
      const task = await taskRepo.findOne({ where: { id } });
      if (!task) throw new NotFoundException('Task not found');
    const originalStatus = task.status;
      Object.assign(task, updateTaskDto);

      const updatedTask = await taskRepo.save(task);
      await queryRunner.commitTransaction();
      if (originalStatus !== updatedTask.status)
        await this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });

      return updatedTask;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Update failed:', err);
      throw new InternalServerErrorException('Task update failed');
    } finally {
      await queryRunner.release();
    }
  }

  async updateBatch(ids: string[], payload: UpdateTaskDto): Promise<Task[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const taskRepo = queryRunner.manager.getRepository(Task);
      const existingTasks = await taskRepo.findBy({ id: In(ids) });
      const originalStatusMap = new Map<string, TaskStatus>();
      for (const task of existingTasks) {
        originalStatusMap.set(task.id, task.status);
      }

      await taskRepo.update({ id: In(ids) }, payload);
      const updatedTasks = await taskRepo.findBy({ id: In(ids) });
      const queueData = updatedTasks
        .filter(task => originalStatusMap.get(task.id) !== payload.status)
        .map(task => ({
          name: 'task-status-update',
          data: {
            taskId: task.id,
            status: task.status,
          },
        }));

      if (queueData.length > 0) {
        await this.taskQueue.addBulk(queueData);
      }
      await queryRunner.commitTransaction();
      return updatedTasks;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Batch update failed:', err);
      throw new InternalServerErrorException('Batch update failed');
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.tasksRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
  }

  async deleteMany(ids: string[]): Promise<{ taskId: string; success: boolean }[]> {
    const existingTasks = await this.tasksRepository.findBy({ id: In(ids) });
    const existingIds = new Set(existingTasks.map(task => task.id));

    await this.tasksRepository.delete({ id: In([...existingIds]) });

    return ids.map(id => ({
      taskId: id,
      success: existingIds.has(id),
    }));
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
  }

  async getStats(): Promise<ITaskStats> {
    const builder = this.tasksRepository.createQueryBuilder('task');

    const result = await builder
      .select([
        'COUNT(*) AS total',
        `COUNT(CASE WHEN task.status = 'COMPLETED' THEN 1 END) AS completed`,
        `COUNT(CASE WHEN task.status = 'IN_PROGRESS' THEN 1 END) AS "inProgress"`,
        `COUNT(CASE WHEN task.status = 'PENDING' THEN 1 END) AS pending`,
        `COUNT(CASE WHEN task.priority = 'HIGH' THEN 1 END) AS "highPriority"`,
      ])
      .getRawOne();

    return {
      total: Number(result.total),
      completed: Number(result.completed),
      inProgress: Number(result.inProgress),
      pending: Number(result.pending),
      highPriority: Number(result.highPriority),
    };
  }
}
