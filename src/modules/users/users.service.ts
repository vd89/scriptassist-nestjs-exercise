import { Injectable, NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { IUser, IUserResponse, IUserWithTasks } from './interfaces/users.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  /**
   * Creates a new user with hashed password.
   * Handles password hashing and user creation in a single operation.
   */
  async create(createUserDto: CreateUserDto): Promise<IUser> {
    try {
      // Hash the password before saving
      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
      
      // Create user entity with hashed password
      const user = this.usersRepository.create({
        ...createUserDto,
        password: hashedPassword,
      });

      // Save the user to the database
      return await this.usersRepository.save(user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to create user',
        error: 'User Creation Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Retrieves all users from the database.
   * Returns an array of user entities.
   */
  async findAll(): Promise<IUserResponse[]> {
    try {
      return await this.usersRepository.find();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to fetch users',
        error: 'User Fetch Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Finds a user by their ID.
   * Throws NotFoundException if user doesn't exist.
   */
  async findOne(id: string): Promise<IUser> {
    try {
      const user = await this.usersRepository.findOne({ where: { id } });
      
      if (!user) {
        throw new NotFoundException({
          message: `User with ID ${id} not found`,
          error: 'User Not Found',
          details: 'The requested user does not exist in the system',
        });
      }
      
      return user;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to fetch user',
        error: 'User Fetch Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Finds a user by their email address.
   * Returns null if user not found.
   */
  async findByEmail(email: string): Promise<IUser | null> {
    try {
      return await this.usersRepository.findOne({ where: { email } });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to fetch user by email',
        error: 'User Fetch Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Updates a user's information.
   * Handles password hashing if password is being updated.
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<IUser> {
    try {
      // Find the user first
      const user = await this.findOne(id);
      
      // If password is being updated, hash it
      if (updateUserDto.password) {
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
      }
      
      // Merge the updates with the existing user
      this.usersRepository.merge(user, updateUserDto);
      
      // Save the updated user
      return await this.usersRepository.save(user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to update user',
        error: 'User Update Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Removes a user from the database.
   * Throws NotFoundException if user doesn't exist.
   */
  async remove(id: string): Promise<void> {
    try {
      // Find the user first
      const user = await this.findOne(id);
      
      // Remove the user from the database
      await this.usersRepository.remove(user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to delete user',
        error: 'User Deletion Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
} 