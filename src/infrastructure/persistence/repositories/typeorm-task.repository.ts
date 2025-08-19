import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  TaskRepository,
  TaskFilters,
  PaginationOptions,
  PaginatedResult
} from '../../../domain/repositories/task.repository.interface';
import { Specification } from '../../../domain/repositories/base.repository.interface';
import { Task, TaskStatus } from '../../../domain/entities/task.entity';
import { TaskModel, TaskStatusModel } from '../entities/task.model';
import { TaskMapper } from '../mappers/task.mapper';
import { EntityId } from '../../../domain/value-objects/entity-id.value-object';
import { CreateTaskDto } from '@modules/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '@modules/tasks/dto/update-task.dto';

@Injectable()
export class TypeOrmTaskRepository implements TaskRepository {
  constructor(
    @InjectRepository(TaskModel)
    private readonly taskRepository: Repository<TaskModel>,
  ) {}

  async findById(id: EntityId): Promise<Task | null> {
    const taskModel = await this.taskRepository.findOne({
      where: { id: id.value },
      relations: ['user'],
    });

    return taskModel ? TaskMapper.toDomain(taskModel) : null;
  }

  async save (task: Task | CreateTaskDto | UpdateTaskDto): Promise<Task> {
    const taskModel = TaskMapper.toPersistence(task);
    const savedTaskModel = await this.taskRepository.save(taskModel);
    return TaskMapper.toDomain(savedTaskModel);
  }

  async delete(id: EntityId): Promise<void> {
    await this.taskRepository.delete({ id: id.value });
  }

  async findAll(
    filters?: TaskFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Task>> {
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    this.applyFilters(queryBuilder, filters);

    // Get total count before pagination
    const total = await queryBuilder.getCount();

    this.applyPagination(queryBuilder, pagination);

    const taskModels = await queryBuilder.getMany();
    const tasks = taskModels.map(TaskMapper.toDomain);

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;

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

  async findByUserId(userId: EntityId): Promise<Task[]> {
    const taskModels = await this.taskRepository.find({
      where: { userId: userId.value },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return taskModels.map(TaskMapper.toDomain);
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    const taskModels = await this.taskRepository.find({
      where: { status: status as unknown as TaskStatusModel },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return taskModels.map(TaskMapper.toDomain);
  }

  async findOverdueTasks(pagination?: PaginationOptions): Promise<PaginatedResult<Task>> {
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.dueDate < :now', { now: new Date() })
      .andWhere('task.status != :completedStatus', {
        completedStatus: TaskStatusModel.COMPLETED
      })
      .orderBy('task.dueDate', 'ASC');

    // Get total count before pagination
    const total = await queryBuilder.getCount();

    this.applyPagination(queryBuilder, pagination);

    const taskModels = await queryBuilder.getMany();
    const tasks = taskModels.map(TaskMapper.toDomain);

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;

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

  async exists(id: EntityId): Promise<boolean> {
    const count = await this.taskRepository.count({
      where: { id: id.value },
    });
    return count > 0;
  }

  async countByUserId(userId: EntityId): Promise<number> {
    return await this.taskRepository.count({
      where: { userId: userId.value },
    });
  }

  async countByStatus(status: TaskStatus): Promise<number> {
    return await this.taskRepository.count({
      where: { status: status as unknown as TaskStatusModel },
    });
  }

  // Specification pattern implementations
  async findBySpecification (spec: Specification<Task>): Promise<Task[]> {
    const query = spec.toQuery();
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    this.applySpecificationQuery(queryBuilder, query);

    const taskModels = await queryBuilder.getMany();
    return taskModels.map(TaskMapper.toDomain);
  }

  async findOneBySpecification (spec: Specification<Task>): Promise<Task | null> {
    const query = spec.toQuery();
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    this.applySpecificationQuery(queryBuilder, query);

    const taskModel = await queryBuilder.getOne();
    return taskModel ? TaskMapper.toDomain(taskModel) : null;
  }

  async countBySpecification (spec: Specification<Task>): Promise<number> {
    const query = spec.toQuery();
    const queryBuilder = this.taskRepository.createQueryBuilder('task');

    this.applySpecificationQuery(queryBuilder, query);

    return await queryBuilder.getCount();
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<TaskModel>,
    filters?: TaskFilters
  ): void {
    if (!filters) return;

    if (filters.status) {
      queryBuilder.andWhere('task.status = :status', { status: filters.status });
    }

    if (filters.priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority: filters.priority });
    }

    if (filters.userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId: filters.userId.value });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(task.title ILIKE :search OR task.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.dueDateStart) {
      queryBuilder.andWhere('task.dueDate >= :dueDateStart', {
        dueDateStart: filters.dueDateStart
      });
    }

    if (filters.dueDateEnd) {
      queryBuilder.andWhere('task.dueDate <= :dueDateEnd', {
        dueDateEnd: filters.dueDateEnd
      });
    }

    if (filters.createdAtStart) {
      queryBuilder.andWhere('task.createdAt >= :createdAtStart', {
        createdAtStart: filters.createdAtStart
      });
    }

    if (filters.createdAtEnd) {
      queryBuilder.andWhere('task.createdAt <= :createdAtEnd', {
        createdAtEnd: filters.createdAtEnd
      });
    }
  }

  private applyPagination(
    queryBuilder: SelectQueryBuilder<TaskModel>,
    pagination?: PaginationOptions
  ): void {
    if (!pagination) return;

    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = pagination;
    const offset = (page - 1) * limit;

    const allowedSortFields = ['title', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'];
    const actualSortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    queryBuilder
      .orderBy(`task.${actualSortField}`, sortOrder)
      .skip(offset)
      .take(limit);
  }

  private applySpecificationQuery (
    queryBuilder: SelectQueryBuilder<TaskModel>,
    query: any
  ): void {
    // Handle MongoDB-style query objects for specifications
    if (query.$and) {
      query.$and.forEach((condition: any, index: number) => {
        this.applyCondition(queryBuilder, condition, `and_${index}`);
      });
    } else if (query.$or) {
      const orConditions = query.$or.map((condition: any, index: number) => {
        return this.buildConditionString(condition, `or_${index}`);
      }).join(' OR ');
      queryBuilder.andWhere(`(${orConditions})`, this.buildConditionParams(query.$or));
    } else {
      this.applyCondition(queryBuilder, query, 'main');
    }
  }

  private applyCondition (
    queryBuilder: SelectQueryBuilder<TaskModel>,
    condition: any,
    paramPrefix: string
  ): void {
    Object.keys(condition).forEach(key => {
      const value = condition[ key ];
      const paramKey = `${paramPrefix}_${key}`;

      if (typeof value === 'object' && value !== null) {
        if (value.$lt) {
          queryBuilder.andWhere(`task.${key} < :${paramKey}`, { [ paramKey ]: value.$lt });
        } else if (value.$gt) {
          queryBuilder.andWhere(`task.${key} > :${paramKey}`, { [ paramKey ]: value.$gt });
        } else if (value.$ne) {
          queryBuilder.andWhere(`task.${key} != :${paramKey}`, { [ paramKey ]: value.$ne });
        }
      } else {
        queryBuilder.andWhere(`task.${key} = :${paramKey}`, { [ paramKey ]: value });
      }
    });
  }

  private buildConditionString (condition: any, paramPrefix: string): string {
    return Object.keys(condition)
      .map(key => {
        const value = condition[ key ];
        const paramKey = `${paramPrefix}_${key}`;

        if (typeof value === 'object' && value !== null) {
          if (value.$lt) return `task.${key} < :${paramKey}`;
          if (value.$gt) return `task.${key} > :${paramKey}`;
          if (value.$ne) return `task.${key} != :${paramKey}`;
        }
        return `task.${key} = :${paramKey}`;
      })
      .join(' AND ');
  }

  private buildConditionParams (conditions: any[]): any {
    const params: any = {};
    conditions.forEach((condition, index) => {
      Object.keys(condition).forEach(key => {
        const value = condition[ key ];
        const paramKey = `or_${index}_${key}`;

        if (typeof value === 'object' && value !== null) {
          if (value.$lt) params[ paramKey ] = value.$lt;
          else if (value.$gt) params[ paramKey ] = value.$gt;
          else if (value.$ne) params[ paramKey ] = value.$ne;
        } else {
          params[ paramKey ] = value;
        }
      });
    });
    return params;
  }
}
