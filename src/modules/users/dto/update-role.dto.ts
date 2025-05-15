import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({ 
    example: 'admin', 
    enum: ['user', 'admin'],
    description: 'User role - either "user" or "admin"'
  })
  @IsEnum(['user', 'admin'], { message: 'Role must be either "user" or "admin"' })
  @IsNotEmpty({ message: 'Role is required' })
  role: string;
} 