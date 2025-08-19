import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDomainService } from '../../domain/services/user-domain.service';
import { User, UserRole } from '../../domain/entities/user.entity';
import { EntityId } from '../../domain/value-objects/entity-id.value-object';
import { Email } from '../../domain/value-objects/email.value-object';
import { USER_REPOSITORY } from '../../domain/repositories/repository.tokens';
import { UserRepository } from '../../domain/repositories/user.repository.interface';


@Injectable()
export class UsersService {
  constructor(
    private readonly userDomainService: UserDomainService,
    @Inject(USER_REPOSITORY)
    private userRepository: UserRepository,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    return await this.userDomainService.createUser({
      email: createUserDto.email,
      name: createUserDto.name,
      password: createUserDto.password,
      role: createUserDto.role as UserRole,
    });
  }

  async findAll (): Promise<User[]> {
    return await this.userRepository.findAll();
  }

  async findOne(id: string): Promise<User> {
    const userId = EntityId.fromString(id);
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const emailVO = Email.create(email);
    return await this.userRepository.findByEmail(emailVO);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const userId = EntityId.fromString(id);
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Handle email update through domain service for validation
    if (updateUserDto.email && updateUserDto.email !== user.email.value) {
      return await this.userDomainService.updateUserEmail(userId, updateUserDto.email);
    }

    // Handle other updates
    if (updateUserDto.name) {
      user.updateName(updateUserDto.name);
    }

    if (updateUserDto.role) {
      user.updateRole(updateUserDto.role as UserRole);
    }

    // Handle password update through domain service for validation
    if (updateUserDto.password) {
      // For simplicity, we'll update directly here
      // In a real app, you might want a separate endpoint for password changes
      user.updatePassword(updateUserDto.password);
    }

    return await this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const userId = EntityId.fromString(id);
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.userRepository.delete(userId);
  }

  async validateUserCredentials (email: string, password: string): Promise<User | null> {
    return await this.userDomainService.validateUserCredentials(email, password);
  }

  async changePassword (
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<User> {
    const userEntityId = EntityId.fromString(userId);
    return await this.userDomainService.changePassword(
      userEntityId,
      currentPassword,
      newPassword
    );
  }

  async promoteToAdmin (userId: string, promotedByUserId: string): Promise<User> {
    const userEntityId = EntityId.fromString(userId);
    const promotedByEntityId = EntityId.fromString(promotedByUserId);

    return await this.userDomainService.promoteToAdmin(userEntityId, promotedByEntityId);
  }

  async demoteFromAdmin (userId: string, demotedByUserId: string): Promise<User> {
    const userEntityId = EntityId.fromString(userId);
    const demotedByEntityId = EntityId.fromString(demotedByUserId);

    return await this.userDomainService.demoteFromAdmin(userEntityId, demotedByEntityId);
  }
}
