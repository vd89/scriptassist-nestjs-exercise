import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRepository } from '../../../domain/repositories/user.repository.interface';
import { User } from '../../../domain/entities/user.entity';
import { UserModel } from '../entities/user.model';
import { UserMapper } from '../mappers/user.mapper';
import { EntityId } from '../../../domain/value-objects/entity-id.value-object';
import { Email } from '../../../domain/value-objects/email.value-object';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserModel)
    private readonly userRepository: Repository<UserModel>,
  ) {}

  async findById(id: EntityId): Promise<User | null> {
    const userModel = await this.userRepository.findOne({
      where: { id: id.value },
    });

    return userModel ? UserMapper.toDomain(userModel) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const userModel = await this.userRepository.findOne({
      where: { email: email.value },
    });

    return userModel ? UserMapper.toDomain(userModel) : null;
  }

  async save(user: User): Promise<User> {
    const userModel = UserMapper.toPersistence(user);
    const savedUserModel = await this.userRepository.save(userModel);
    return UserMapper.toDomain(savedUserModel);
  }

  async delete(id: EntityId): Promise<void> {
    await this.userRepository.delete({ id: id.value });
  }

  async findAll(): Promise<User[]> {
    const userModels = await this.userRepository.find();
    return userModels.map(UserMapper.toDomain);
  }

  async exists(id: EntityId): Promise<boolean> {
    const count = await this.userRepository.count({
      where: { id: id.value },
    });
    return count > 0;
  }
}
