import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, In } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard'; // Assume this exists

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = 100;

  constructor(
    @InjectQueue('task-processing') private taskQueue: Queue,
    @InjectRepository(Task) private tasksRepository: Repository<Task>,
  ) {}

  @UseGuards(JwtAuthGuard) // Optional: for manual triggering
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Starting overdue tasks check...');

    try {
      const now = new Date();
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        // Fetch overdue tasks efficiently
        const [overdueTasks, total] = await this.tasksRepository.findAndCount({
          where: {
            dueDate: LessThan(now),
            status: TaskStatus.PENDING,
          },
          relations: ['user'], // Eager load user to avoid N+1
          select: ['id', 'dueDate', 'status', 'userId'], // Limit fields for performance
          take: this.BATCH_SIZE,
          skip: (page - 1) * this.BATCH_SIZE,
          order: { dueDate: 'ASC' },
        });

        this.logger.log(`Found ${overdueTasks.length} overdue tasks in batch (total: ${total})`);

        if (overdueTasks.length === 0) {
          hasMore = false;
          break;
        }

        // Process and queue tasks transactionally
        await this.tasksRepository.manager.transaction(async (manager) => {
          const tasksToQueue = overdueTasks.map(task => ({
            name: 'process-overdue-task',
            data: { taskId: task.id, userId: task.userId }, // Use userId from column
            opts: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              priority: this.calculatePriority(task.dueDate),
            },
          }));

          await this.taskQueue.addBulk(tasksToQueue);

          await manager.update(
            Task,
            { id: In(overdueTasks.map(t => t.id)) },
            { status: TaskStatus.QUEUED, updatedAt: new Date() }, // QUEUED now valid
          );
        });

        page++;
        hasMore = overdueTasks.length === this.BATCH_SIZE;
      }

      this.logger.debug('Overdue tasks check completed successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Failed to process overdue tasks', errorStack);
      throw new Error(`Overdue tasks processing failed: ${errorMessage}`);
    }
  }

  private calculatePriority(dueDate: Date): number {
    const now = new Date();
    const overdueMs = now.getTime() - dueDate.getTime();
    return Math.min(Math.floor(overdueMs / (1000 * 60 * 60)), 10); // Priority: 1-10
  }

  async triggerOverdueCheckManually(user: any) {
    if (!user || !user.roles?.includes('admin')) {
      throw new ForbiddenException('Only admins can trigger this manually');
    }
    await this.checkOverdueTasks();
  }
}