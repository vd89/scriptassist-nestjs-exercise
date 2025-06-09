import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Total number of items' })
  total: number;

  @ApiProperty({ description: 'Current page number (1-based)' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  itemsPerPage: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Does the result have a previous page' })
  hasPreviousPage: boolean;

  @ApiProperty({ description: 'Does the result have a next page' })
  hasNextPage: boolean;

  constructor(total: number, paginationOptions: { page: number; limit: number }) {
    this.total = total;
    this.currentPage = paginationOptions.page;
    this.itemsPerPage = paginationOptions.limit;
    this.totalPages = Math.ceil(this.total / this.itemsPerPage);
    this.hasPreviousPage = this.currentPage > 1;
    this.hasNextPage = this.currentPage < this.totalPages;
  }
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty()
  meta: PaginationMetaDto;

  constructor(data: T[], meta: PaginationMetaDto) {
    this.data = data;
    this.meta = meta;
  }

  static create<T>(
    data: T[],
    total: number,
    paginationOptions: { page: number; limit: number },
  ): PaginatedResponseDto<T> {
    const meta = new PaginationMetaDto(total, paginationOptions);
    return new PaginatedResponseDto(data, meta);
  }
} 