import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskCommentService } from './task-comment.service';
import { TaskComment } from '../entities/task-comment.entity';
import { Task } from '../entities/task.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { TaskHistoryAction } from '../enums/task-history-action.enum';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('TaskCommentService', () => {
  let service: TaskCommentService;
  let taskCommentRepository: any;
  let taskRepository: any;
  let taskHistoryRepository: any;

  const mockTask = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
  };

  const mockComment = {
    id: '1',
    content: 'Test Comment',
    taskId: '1',
    userId: '1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCommentService,
        {
          provide: getRepositoryToken(TaskComment),
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

    service = module.get<TaskCommentService>(TaskCommentService);
    taskCommentRepository = module.get(getRepositoryToken(TaskComment));
    taskRepository = module.get(getRepositoryToken(Task));
    taskHistoryRepository = module.get(getRepositoryToken(TaskHistory));
  });

  describe('create', () => {
    it('should create a new comment', async () => {
      const createCommentDto = {
        content: 'Test Comment',
        taskId: '1',
        userId: '1',
      };

      taskRepository.findOne.mockResolvedValue(mockTask);
      taskCommentRepository.create.mockReturnValue(mockComment);
      taskCommentRepository.save.mockResolvedValue(mockComment);
      taskHistoryRepository.create.mockReturnValue({
        taskId: '1',
        userId: '1',
        action: TaskHistoryAction.COMMENT_ADDED,
        newValue: { content: 'Test Comment' },
      });

      const result = await service.create(createCommentDto);

      expect(result).toEqual(mockComment);
      expect(taskCommentRepository.create).toHaveBeenCalledWith(createCommentDto);
      expect(taskCommentRepository.save).toHaveBeenCalledWith(mockComment);
      expect(taskHistoryRepository.create).toHaveBeenCalled();
      expect(taskHistoryRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      const createCommentDto = {
        content: 'Test Comment',
        taskId: '1',
        userId: '1',
      };

      taskRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createCommentDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return an array of comments', async () => {
      const comments = [mockComment];
      taskCommentRepository.find.mockResolvedValue(comments);

      const result = await service.findAll('1');

      expect(result).toEqual(comments);
      expect(taskCommentRepository.find).toHaveBeenCalledWith({
        where: { taskId: '1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a comment by id', async () => {
      taskCommentRepository.findOne.mockResolvedValue(mockComment);

      const result = await service.findOne('1');

      expect(result).toEqual(mockComment);
      expect(taskCommentRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if comment not found', async () => {
      taskCommentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a comment', async () => {
      const updateCommentDto = {
        content: 'Updated Comment',
      };

      taskCommentRepository.findOne.mockResolvedValue(mockComment);
      taskCommentRepository.save.mockResolvedValue({
        ...mockComment,
        content: 'Updated Comment',
      });

      const result = await service.update('1', updateCommentDto, '1');

      expect(result.content).toBe('Updated Comment');
      expect(taskCommentRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if comment not found', async () => {
      const updateCommentDto = {
        content: 'Updated Comment',
      };

      taskCommentRepository.findOne.mockResolvedValue(null);

      await expect(service.update('1', updateCommentDto, '1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the author', async () => {
      const updateCommentDto = {
        content: 'Updated Comment',
      };

      taskCommentRepository.findOne.mockResolvedValue(mockComment);

      await expect(service.update('1', updateCommentDto, '2')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should remove a comment', async () => {
      taskCommentRepository.findOne.mockResolvedValue(mockComment);
      taskCommentRepository.remove.mockResolvedValue(mockComment);

      const result = await service.remove('1', '1');

      expect(result).toEqual(mockComment);
      expect(taskCommentRepository.remove).toHaveBeenCalledWith(mockComment);
    });

    it('should throw NotFoundException if comment not found', async () => {
      taskCommentRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('1', '1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the author', async () => {
      taskCommentRepository.findOne.mockResolvedValue(mockComment);

      await expect(service.remove('1', '2')).rejects.toThrow(ForbiddenException);
    });
  });
});
