import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({ example: 'john.updated@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'John Updated', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'NewPassword123!', required: false })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;
  
  @ApiProperty({ example: 'admin', required: false, enum: ['user', 'admin'] })
  @IsEnum(['user', 'admin'], { message: 'Role must be either "user" or "admin"' })
  @IsOptional()
  role?: string;
} 