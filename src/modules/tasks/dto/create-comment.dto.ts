import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'This task needs more details about the requirements.' })
  @IsString()
  content: string;

  @ApiProperty({
    example: { mentions: ['@john'], links: ['https://example.com'] },
    required: false,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
