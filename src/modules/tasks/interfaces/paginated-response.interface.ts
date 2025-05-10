export interface PaginatedResponse<T = any> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}
