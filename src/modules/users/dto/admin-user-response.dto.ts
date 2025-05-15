import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { UserResponseDto } from './user-response.dto';

export class AdminUserResponseDto extends UserResponseDto {
  @Expose()
  @ApiProperty({ example: 'user', enum: ['user', 'manager', 'admin'] })
  role: string;
} 