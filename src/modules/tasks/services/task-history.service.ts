import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TaskHistory } from '../entities/task-history.entity';
import { Task } from '../entities/task.entity';
import { TaskHistoryAction } from '../enums/task-history-action.enum';

interface CreateHistoryDto {
  action: TaskHistoryAction;
  oldValue?: any;
  newValue?: any;
  description: string;
}

@Injectable()
export class TaskHistoryService {
  constructor(
    @InjectRepository(TaskHistory)
    private readonly historyRepository: Repository<TaskHistory>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async create(
    taskId: string,
    userId: string,
    createHistoryDto: CreateHistoryDto,
  ): Promise<TaskHistory> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const historyEntry = this.historyRepository.create({
      ...createHistoryDto,
      taskId,
      userId,
    });

    return this.historyRepository.save(historyEntry);
  }

  async findAll(taskId: string): Promise<TaskHistory[]> {
    return this.historyRepository.find({
      where: { taskId },
      relations: ['user'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<TaskHistory> {
    const historyEntry = await this.historyRepository.findOne({
      where: { id },
      relations: ['user', 'task'],
    });

    if (!historyEntry) {
      throw new NotFoundException(`History entry with ID ${id} not found`);
    }

    return historyEntry;
  }

  async findByAction(taskId: string, action: TaskHistoryAction): Promise<TaskHistory[]> {
    return this.historyRepository.find({
      where: { taskId, action },
      relations: ['user'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findByDateRange(taskId: string, startDate: Date, endDate: Date): Promise<TaskHistory[]> {
    return this.historyRepository.find({
      where: {
        taskId,
        createdAt: Between(startDate, endDate),
      },
      relations: ['user'],
      order: {
        createdAt: 'DESC',
      },
    });
  }
}
