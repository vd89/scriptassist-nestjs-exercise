import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskCategoryService } from './task-category.service';
import { TaskCategory } from '../entities/task-category.entity';
import { Task } from '../entities/task.entity';
import { NotFoundException } from '@nestjs/common';

describe('TaskCategoryService', () => {
  let service: TaskCategoryService;
  let categoryRepository: Repository<TaskCategory>;

  const mockCategory = {
    id: '1',
    name: 'Test Category',
    description: 'Test Description',
    color: '#FF5733',
    tasks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTask = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: new Date(),
    userId: 'user1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCategoryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      relation: jest.fn().mockReturnThis(),
      of: jest.fn().mockReturnThis(),
      add: jest.fn(),
      remove: jest.fn(),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCategoryService,
        {
          provide: getRepositoryToken(TaskCategory),
          useValue: mockCategoryRepository,
        },
      ],
    }).compile();

    service = module.get<TaskCategoryService>(TaskCategoryService);
    categoryRepository = module.get<Repository<TaskCategory>>(getRepositoryToken(TaskCategory));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new category', async () => {
      const createCategoryDto = {
        name: 'New Category',
        description: 'New Description',
        color: '#FF5733',
      };

      mockCategoryRepository.create.mockReturnValue({
        ...createCategoryDto,
        id: '2',
        tasks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockCategoryRepository.save.mockResolvedValue({
        ...createCategoryDto,
        id: '2',
        tasks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createCategoryDto);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', createCategoryDto.name);
      expect(result).toHaveProperty('color', createCategoryDto.color);
    });
  });

  describe('findAll', () => {
    it('should return an array of categories', async () => {
      const mockCategories = [mockCategory];
      mockCategoryRepository.find.mockResolvedValue(mockCategories);

      const result = await service.findAll();

      expect(result).toEqual(mockCategories);
      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        relations: ['tasks'],
      });
    });
  });

  describe('findOne', () => {
    it('should return a category by id', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(mockCategory);

      const result = await service.findOne('1');

      expect(result).toEqual(mockCategory);
      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['tasks'],
      });
    });

    it('should throw NotFoundException when category is not found', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      const updateCategoryDto = {
        name: 'Updated Category',
        color: '#33FF57',
      };

      mockCategoryRepository.findOne.mockResolvedValue(mockCategory);
      mockCategoryRepository.save.mockResolvedValue({
        ...mockCategory,
        ...updateCategoryDto,
      });

      const result = await service.update('1', updateCategoryDto);

      expect(result).toHaveProperty('name', updateCategoryDto.name);
      expect(result).toHaveProperty('color', updateCategoryDto.color);
    });

    it('should throw NotFoundException when category is not found', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.update('1', { name: 'Updated Category' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a category', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(mockCategory);
      mockCategoryRepository.remove.mockResolvedValue(mockCategory);

      await service.remove('1');

      expect(mockCategoryRepository.remove).toHaveBeenCalledWith(mockCategory);
    });

    it('should throw NotFoundException when category is not found', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addTaskToCategory', () => {
    it('should add a task to a category', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(mockCategory);
      mockCategoryRepository.createQueryBuilder.mockReturnValue({
        relation: jest.fn().mockReturnThis(),
        of: jest.fn().mockReturnThis(),
        add: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.addTaskToCategory('1', '1');

      expect(result).toEqual(mockCategory);
      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['tasks'],
      });
    });

    it('should throw NotFoundException when category is not found', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.addTaskToCategory('1', '1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeTaskFromCategory', () => {
    it('should remove a task from a category', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(mockCategory);
      mockCategoryRepository.createQueryBuilder.mockReturnValue({
        relation: jest.fn().mockReturnThis(),
        of: jest.fn().mockReturnThis(),
        add: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.removeTaskFromCategory('1', '1');

      expect(result).toEqual(mockCategory);
      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['tasks'],
      });
    });

    it('should throw NotFoundException when category is not found', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.removeTaskFromCategory('1', '1')).rejects.toThrow(NotFoundException);
    });
  });
});
