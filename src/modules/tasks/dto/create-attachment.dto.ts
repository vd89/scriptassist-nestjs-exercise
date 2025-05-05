import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAttachmentDto {
  @ApiProperty({ example: 'document.pdf' })
  @IsString()
  filename: string;

  @ApiProperty({ example: 'Project Requirements.pdf' })
  @IsString()
  originalName: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  mimeType: string;

  @ApiProperty({ example: 1024 })
  @IsString()
  size: number;

  @ApiProperty({ example: '/uploads/documents/document.pdf' })
  @IsString()
  path: string;

  @ApiProperty({ example: { tags: ['requirements', 'pdf'] }, required: false })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
