import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { TaskCategory } from './entities/task-category.entity';
import { TaskDependency } from './entities/task-dependency.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskAttachment } from './entities/task-attachment.entity';
import { TaskHistory } from './entities/task-history.entity';
import { TaskCategoryService } from './services/task-category.service';
import { TaskDependencyService } from './services/task-dependency.service';
import { TaskCommentService } from './services/task-comment.service';
import { TaskAttachmentService } from './services/task-attachment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskCategory,
      TaskDependency,
      TaskComment,
      TaskAttachment,
      TaskHistory,
    ]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskCategoryService,
    TaskDependencyService,
    TaskCommentService,
    TaskAttachmentService,
  ],
  exports: [
    TasksService,
    TaskCategoryService,
    TaskDependencyService,
    TaskCommentService,
    TaskAttachmentService,
  ],
})
export class TasksModule {}
