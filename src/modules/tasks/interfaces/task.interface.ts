import { Task } from '../entities/task.entity';

export interface IBatchRespone {
  taskId: string;
  success: boolean;
  result?: Task | null;
  error?: string;
}

export interface IPaginationOptions {
  page: number;
  limit: number;
}

export interface IPaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export interface ITaskStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  highPriority: number;
}
