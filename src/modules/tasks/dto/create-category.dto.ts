import { IsString, IsOptional, IsHexColor } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Development' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Tasks related to software development', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '#FF5733', required: false })
  @IsHexColor()
  @IsOptional()
  color?: string;
}
