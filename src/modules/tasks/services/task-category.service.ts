import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskCategory } from '../entities/task-category.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';

@Injectable()
export class TaskCategoryService {
  constructor(
    @InjectRepository(TaskCategory)
    private categoryRepository: Repository<TaskCategory>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<TaskCategory> {
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  async findAll(): Promise<TaskCategory[]> {
    return this.categoryRepository.find({
      relations: ['tasks'],
    });
  }

  async findOne(id: string): Promise<TaskCategory> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['tasks'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: string, updateCategoryDto: Partial<CreateCategoryDto>): Promise<TaskCategory> {
    const category = await this.findOne(id);
    Object.assign(category, updateCategoryDto);
    return this.categoryRepository.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
  }

  async addTaskToCategory(categoryId: string, taskId: string): Promise<TaskCategory> {
    const category = await this.findOne(categoryId);
    await this.categoryRepository
      .createQueryBuilder('category')
      .relation(TaskCategory, 'tasks')
      .of(category)
      .add(taskId);
    return this.findOne(categoryId);
  }

  async removeTaskFromCategory(categoryId: string, taskId: string): Promise<TaskCategory> {
    const category = await this.findOne(categoryId);
    await this.categoryRepository
      .createQueryBuilder('category')
      .relation(TaskCategory, 'tasks')
      .of(category)
      .remove(taskId);
    return this.findOne(categoryId);
  }
}
