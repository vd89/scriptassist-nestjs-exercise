import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { UserResponseDto } from '../../users/dto/user-response.dto';

@Exclude()
export class LoginResponseDto {
  @Expose()
  @ApiProperty()
  @Type(() => UserResponseDto)
  user: UserResponseDto;

  @Expose()
  access_token: string;

  @Expose()
  refresh_token: string;

  constructor(partial: Partial<LoginResponseDto>) {
    Object.assign(this, partial);
  }
} 