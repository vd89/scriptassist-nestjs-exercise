import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskComment } from '../entities/task-comment.entity';
import { Task } from '../entities/task.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { TaskHistoryAction } from '../enums/task-history-action.enum';

export interface CreateCommentDto {
  content: string;
  taskId: string;
  userId: string;
}

export interface UpdateCommentDto {
  content: string;
}

@Injectable()
export class TaskCommentService {
  constructor(
    @InjectRepository(TaskComment)
    private readonly commentRepository: Repository<TaskComment>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(TaskHistory)
    private readonly historyRepository: Repository<TaskHistory>,
  ) {}

  async create(createCommentDto: CreateCommentDto): Promise<TaskComment> {
    const task = await this.taskRepository.findOne({
      where: { id: createCommentDto.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const comment = this.commentRepository.create(createCommentDto);
    const savedComment = await this.commentRepository.save(comment);

    const history = this.historyRepository.create({
      taskId: createCommentDto.taskId,
      userId: createCommentDto.userId,
      action: TaskHistoryAction.COMMENT_ADDED,
      newValue: { content: createCommentDto.content },
    });
    await this.historyRepository.save(history);

    return savedComment;
  }

  async findAll(taskId: string): Promise<TaskComment[]> {
    return this.commentRepository.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TaskComment> {
    const comment = await this.commentRepository.findOne({
      where: { id },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
  }

  async update(
    id: string,
    updateCommentDto: UpdateCommentDto,
    userId: string,
  ): Promise<TaskComment> {
    const comment = await this.findOne(id);

    if (comment.userId !== userId) {
      throw new ForbiddenException('You are not authorized to update this comment');
    }

    Object.assign(comment, updateCommentDto);
    return this.commentRepository.save(comment);
  }

  async remove(id: string, userId: string): Promise<TaskComment> {
    const comment = await this.findOne(id);

    if (comment.userId !== userId) {
      throw new ForbiddenException('You are not authorized to delete this comment');
    }

    return this.commentRepository.remove(comment);
  }
}
