import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskDependency } from '../entities/task-dependency.entity';
import { Task } from '../entities/task.entity';
import { CreateDependencyDto } from '../dto/create-dependency.dto';

@Injectable()
export class TaskDependencyService {
  constructor(
    @InjectRepository(TaskDependency)
    private dependencyRepository: Repository<TaskDependency>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  async create(taskId: string, createDependencyDto: CreateDependencyDto): Promise<TaskDependency> {
    const { dependentTaskId, type } = createDependencyDto;

    // Check if both tasks exist
    const [task, dependentTask] = await Promise.all([
      this.taskRepository.findOne({ where: { id: taskId } }),
      this.taskRepository.findOne({ where: { id: dependentTaskId } }),
    ]);

    if (!task || !dependentTask) {
      throw new NotFoundException('Task not found');
    }

    // Check for circular dependencies
    if (await this.wouldCreateCircularDependency(taskId, dependentTaskId)) {
      throw new BadRequestException('Circular dependency detected');
    }

    const dependency = this.dependencyRepository.create({
      taskId,
      dependentTaskId,
      type,
    });

    return this.dependencyRepository.save(dependency);
  }

  async findAll(taskId: string): Promise<TaskDependency[]> {
    return this.dependencyRepository.find({
      where: { taskId },
      relations: ['task', 'dependentTask'],
    });
  }

  async findDependentTasks(taskId: string): Promise<TaskDependency[]> {
    return this.dependencyRepository.find({
      where: { dependentTaskId: taskId },
      relations: ['task', 'dependentTask'],
    });
  }

  async remove(id: string): Promise<void> {
    const dependency = await this.dependencyRepository.findOne({ where: { id } });

    if (!dependency) {
      throw new NotFoundException('Dependency not found');
    }

    await this.dependencyRepository.remove(dependency);
  }

  private async wouldCreateCircularDependency(
    taskId: string,
    dependentTaskId: string,
  ): Promise<boolean> {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = async (currentId: string): Promise<boolean> => {
      if (stack.has(currentId)) {
        return true; // Circular dependency found
      }

      if (visited.has(currentId)) {
        return false;
      }

      visited.add(currentId);
      stack.add(currentId);

      const dependencies = await this.dependencyRepository.find({
        where: { taskId: currentId },
      });

      for (const dep of dependencies) {
        if (await dfs(dep.dependentTaskId)) {
          return true;
        }
      }

      stack.delete(currentId);
      return false;
    };

    return dfs(dependentTaskId);
  }
}
