import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ClassSerializerInterceptor, UseInterceptors, Query, HttpStatus, HttpCode, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserResponseDto } from './dto/user-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { User } from './entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ResourcePermission } from '../auth/constants/permissions';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PaginatedResponseDto } from '../../common/dto/pagination-response.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';

@ApiTags('users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'User created successfully', type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already in use' })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersService.create(createUserDto);
    return new UserResponseDto(user);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(ResourcePermission.READ_USER)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of users', type: [AdminUserResponseDto] })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Admin access required' })
  async findAll(@Query() paginationDto: PaginationDto, @CurrentUser() currentUser: User): Promise<PaginatedResponseDto<UserResponseDto | AdminUserResponseDto>> {
    const paginatedUsers = await this.usersService.findAll(paginationDto);
    
    // Transform each user - use AdminUserResponseDto for admins, regular for others
    const transformedData = paginatedUsers.data.map(user => {
      return currentUser.role === 'admin' 
        ? new AdminUserResponseDto(user) 
        : new UserResponseDto(user);
    });
    
    // Create a new paginated response with transformed data
    return new PaginatedResponseDto(
      transformedData,
      paginatedUsers.meta
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User profile', type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized - Login required' })
  async getProfile(@CurrentUser() user: User): Promise<UserResponseDto> {
    return new UserResponseDto(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User details', type: AdminUserResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Admin access required' })
  async findOne(@Param('id') id: string): Promise<AdminUserResponseDto> {
    const user = await this.usersService.findOne(id);
    return new AdminUserResponseDto(user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update user (admin or self only)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User updated successfully', type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Cannot update other users unless admin' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already in use' })
  async update(
    @Param('id') id: string, 
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: User
  ): Promise<UserResponseDto | AdminUserResponseDto> {
    // Check if user is updating their own profile or is an admin
    if (id !== currentUser.id && currentUser.role !== 'admin') {
      throw new ForbiddenException('You are not authorized to update this user');
    }
    
    // Only admins can change roles
    if (updateUserDto.role && currentUser.role !== 'admin') {
      throw new ForbiddenException('Only administrators can change user roles');
    }
    
    const user = await this.usersService.update(id, updateUserDto);
    return currentUser.role === 'admin' 
      ? new AdminUserResponseDto(user) 
      : new UserResponseDto(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User role updated successfully', type: AdminUserResponseDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid role specified' })
  async updateRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @CurrentUser() currentUser: User
  ): Promise<AdminUserResponseDto> {
    const user = await this.usersService.updateRole(id, updateRoleDto.role, currentUser.id);
    return new AdminUserResponseDto(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user (admin only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'User deleted successfully' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Admin access required' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
} 