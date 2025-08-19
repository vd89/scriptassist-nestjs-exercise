import { Injectable, Inject } from '@nestjs/common';
import { User, UserRole } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository.interface';
import { USER_REPOSITORY } from '../repositories/repository.tokens';
import { Email } from '../value-objects/email.value-object';
import { EntityId } from '../value-objects/entity-id.value-object';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserDomainService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async createUser(userData: {
    email: string;
    name: string;
    password: string;
    role?: UserRole;
  }): Promise<User> {
    const email = Email.create(userData.email);
    
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password before creating user
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const user = User.create({
      email: userData.email,
      name: userData.name,
      password: hashedPassword,
      role: userData.role,
    });

    return await this.userRepository.save(user);
  }

  async updateUserEmail(userId: EntityId, newEmail: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const email = Email.create(newEmail);
    
    // Check if email is already taken by another user
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser && !existingUser.id.equals(userId)) {
      throw new Error('Email is already taken by another user');
    }

    user.updateEmail(newEmail);
    return await this.userRepository.save(user);
  }

  async changePassword(userId: EntityId, currentPassword: string, newPassword: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password.value);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.updatePassword(hashedNewPassword);
    
    return await this.userRepository.save(user);
  }

  async validateUserCredentials(email: string, password: string): Promise<User | null> {
    const emailVO = Email.create(email);
    const user = await this.userRepository.findByEmail(emailVO);
    
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password.value);
    return isPasswordValid ? user : null;
  }

  async promoteToAdmin(userId: EntityId, promotedByUserId: EntityId): Promise<User> {
    const [user, promotedBy] = await Promise.all([
      this.userRepository.findById(userId),
      this.userRepository.findById(promotedByUserId),
    ]);

    if (!user) {
      throw new Error('User not found');
    }

    if (!promotedBy) {
      throw new Error('Promoting user not found');
    }

    if (!promotedBy.isAdmin()) {
      throw new Error('Only administrators can promote users');
    }

    if (user.isAdmin()) {
      throw new Error('User is already an administrator');
    }

    user.updateRole(UserRole.ADMIN);
    return await this.userRepository.save(user);
  }

  async demoteFromAdmin(userId: EntityId, demotedByUserId: EntityId): Promise<User> {
    const [user, demotedBy] = await Promise.all([
      this.userRepository.findById(userId),
      this.userRepository.findById(demotedByUserId),
    ]);

    if (!user) {
      throw new Error('User not found');
    }

    if (!demotedBy) {
      throw new Error('Demoting user not found');
    }

    if (!demotedBy.isAdmin()) {
      throw new Error('Only administrators can demote users');
    }

    if (!user.isAdmin()) {
      throw new Error('User is not an administrator');
    }

    if (user.id.equals(demotedBy.id)) {
      throw new Error('Users cannot demote themselves');
    }

    user.updateRole(UserRole.USER);
    return await this.userRepository.save(user);
  }
}
