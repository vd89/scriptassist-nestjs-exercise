import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../../common/dto/pagination-response.dto';
import { AVAILABLE_ROLES } from '../auth/constants/permissions';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if email already exists
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }
    
    // Validate the role if provided, otherwise use default 'user' role
    let role = 'user'; // Default role
    if (createUserDto.role && AVAILABLE_ROLES.includes(createUserDto.role)) {
      role = createUserDto.role;
    }
    
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role,
    });
    return this.usersRepository.save(user);
  }

  async findAll(paginationDto?: PaginationDto): Promise<PaginatedResponseDto<User>> {
    const { page = 0, limit = 10 } = paginationDto || {};
    
    const [data, total] = await this.usersRepository.findAndCount({
      skip: page * limit,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });
    
    return PaginatedResponseDto.create(data, total, { page, limit });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    
    // Check if trying to update email to one that's already in use
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }
    
    // Hash password if it's being updated
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    
    this.usersRepository.merge(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  async updateResetToken(id: string, token: string, expires: Date): Promise<User> {
    const user = await this.findOne(id);
    user.resetToken = token;
    user.resetTokenExpires = expires;
    return this.usersRepository.save(user);
  }

  async updatePassword(id: string, password: string): Promise<User> {
    const user = await this.findOne(id);
    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpires = null;
    return this.usersRepository.save(user);
  }

  async findByResetToken(token: string): Promise<User | null> {
    const currentDate = new Date();
    return this.usersRepository.findOne({
      where: {
        resetToken: token,
        resetTokenExpires: MoreThanOrEqual(currentDate),
      },
    });
  }
  
  async updateRole(id: string, role: string, currentUserId: string): Promise<User> {
    const user = await this.findOne(id);
    const currentUser = await this.findOne(currentUserId);
    
    // Validate role
    if (!AVAILABLE_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role specified. Role must be one of: ${AVAILABLE_ROLES.join(', ')}`);
    }
    
    // Check if current user is admin
    if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Only administrators can change user roles');
    }
    
    // Prevent removing the last admin
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await this.usersRepository.count({
        where: { role: 'admin' }
      });
      
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot demote the last administrator');
      }
    }
    
    user.role = role;
    return this.usersRepository.save(user);
  }
  
  async validateUserPassword(email: string, password: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    return user;
  }
} 