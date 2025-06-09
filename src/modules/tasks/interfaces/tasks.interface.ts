import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export interface ITask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaskStatistics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  highPriority: number;
}

export interface IPaginatedTasks {
  data: ITask[];
  count: number;
  page: number;
  limit: number;
}

export interface IBatchProcessResult {
  taskId: string;
  success: boolean;
  result?: string;
  error?: string;
}

export interface IBatchProcessRequest {
  tasks: string[];
  action: 'complete' | 'delete';
} 