import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AVAILABLE_ROLES } from '../../auth/constants/permissions';

export class CreateUserDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiProperty({ 
    example: 'Password123!', 
    description: 'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character' 
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, 
    { message: 'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character' }
  )
  password: string;
  
  // Internal field used by services, not exposed in API docs
  @IsEnum(AVAILABLE_ROLES, { message: 'Role must be one of: user, manager, admin' })
  @IsOptional()
  role?: string;
} 