import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskAttachmentService } from './task-attachment.service';
import { TaskAttachment } from '../entities/task-attachment.entity';
import { Task } from '../entities/task.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { TaskHistoryAction } from '../enums/task-history-action.enum';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('TaskAttachmentService', () => {
  let service: TaskAttachmentService;
  let taskAttachmentRepository: any;
  let taskRepository: any;
  let taskHistoryRepository: any;

  const mockTask = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
  };

  const mockAttachment = {
    id: '1',
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    taskId: '1',
    userId: '1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAttachmentService,
        {
          provide: getRepositoryToken(TaskAttachment),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Task),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TaskHistory),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaskAttachmentService>(TaskAttachmentService);
    taskAttachmentRepository = module.get(getRepositoryToken(TaskAttachment));
    taskRepository = module.get(getRepositoryToken(Task));
    taskHistoryRepository = module.get(getRepositoryToken(TaskHistory));
  });

  describe('create', () => {
    it('should create a new attachment', async () => {
      const createAttachmentDto = {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        taskId: '1',
        userId: '1',
      };

      taskRepository.findOne.mockResolvedValue(mockTask);
      taskAttachmentRepository.create.mockReturnValue(mockAttachment);
      taskAttachmentRepository.save.mockResolvedValue(mockAttachment);
      taskHistoryRepository.create.mockReturnValue({
        taskId: '1',
        userId: '1',
        action: TaskHistoryAction.ATTACHMENT_ADDED,
        newValue: { filename: 'test.pdf' },
      });

      const result = await service.create(createAttachmentDto);

      expect(result).toEqual(mockAttachment);
      expect(taskAttachmentRepository.create).toHaveBeenCalledWith(createAttachmentDto);
      expect(taskAttachmentRepository.save).toHaveBeenCalledWith(mockAttachment);
      expect(taskHistoryRepository.create).toHaveBeenCalled();
      expect(taskHistoryRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      const createAttachmentDto = {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        taskId: '1',
        userId: '1',
      };

      taskRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createAttachmentDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return an array of attachments', async () => {
      const attachments = [mockAttachment];
      taskAttachmentRepository.find.mockResolvedValue(attachments);

      const result = await service.findAll('1');

      expect(result).toEqual(attachments);
      expect(taskAttachmentRepository.find).toHaveBeenCalledWith({
        where: { taskId: '1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return an attachment by id', async () => {
      taskAttachmentRepository.findOne.mockResolvedValue(mockAttachment);

      const result = await service.findOne('1');

      expect(result).toEqual(mockAttachment);
      expect(taskAttachmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if attachment not found', async () => {
      taskAttachmentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove an attachment', async () => {
      taskAttachmentRepository.findOne.mockResolvedValue(mockAttachment);
      taskAttachmentRepository.remove.mockResolvedValue(mockAttachment);

      const result = await service.remove('1', '1');

      expect(result).toEqual(mockAttachment);
      expect(taskAttachmentRepository.remove).toHaveBeenCalledWith(mockAttachment);
    });

    it('should throw NotFoundException if attachment not found', async () => {
      taskAttachmentRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('1', '1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the author', async () => {
      taskAttachmentRepository.findOne.mockResolvedValue(mockAttachment);

      await expect(service.remove('1', '2')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByMimeType', () => {
    it('should return attachments filtered by mime type', async () => {
      const attachments = [mockAttachment];
      taskAttachmentRepository.find.mockResolvedValue(attachments);

      const result = await service.findByMimeType('1', 'application/pdf');

      expect(result).toEqual(attachments);
      expect(taskAttachmentRepository.find).toHaveBeenCalledWith({
        where: { taskId: '1', mimeType: 'application/pdf' },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
