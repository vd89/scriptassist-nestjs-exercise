import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskAttachment } from '../entities/task-attachment.entity';
import { Task } from '../entities/task.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { TaskHistoryAction } from '../enums/task-history-action.enum';

export interface CreateAttachmentDto {
  filename: string;
  mimeType: string;
  size: number;
  taskId: string;
  userId: string;
}

@Injectable()
export class TaskAttachmentService {
  constructor(
    @InjectRepository(TaskAttachment)
    private readonly attachmentRepository: Repository<TaskAttachment>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(TaskHistory)
    private readonly historyRepository: Repository<TaskHistory>,
  ) {}

  async create(createAttachmentDto: CreateAttachmentDto): Promise<TaskAttachment> {
    const task = await this.taskRepository.findOne({
      where: { id: createAttachmentDto.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const attachment = this.attachmentRepository.create(createAttachmentDto);
    const savedAttachment = await this.attachmentRepository.save(attachment);

    const history = this.historyRepository.create({
      taskId: createAttachmentDto.taskId,
      userId: createAttachmentDto.userId,
      action: TaskHistoryAction.ATTACHMENT_ADDED,
      newValue: { filename: createAttachmentDto.filename },
    });
    await this.historyRepository.save(history);

    return savedAttachment;
  }

  async findAll(taskId: string): Promise<TaskAttachment[]> {
    return this.attachmentRepository.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TaskAttachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  async remove(id: string, userId: string): Promise<TaskAttachment> {
    const attachment = await this.findOne(id);

    if (attachment.userId !== userId) {
      throw new ForbiddenException('You are not authorized to delete this attachment');
    }

    return this.attachmentRepository.remove(attachment);
  }

  async findByMimeType(taskId: string, mimeType: string): Promise<TaskAttachment[]> {
    return this.attachmentRepository.find({
      where: { taskId, mimeType },
      order: { createdAt: 'DESC' },
    });
  }
}
