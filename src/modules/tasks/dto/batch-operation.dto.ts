import { IsArray, IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

export class BatchTaskOperationDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty({ each: true })
  tasks: string[];

  @IsEnum(['complete', 'delete'])
  action: 'complete' | 'delete';
}