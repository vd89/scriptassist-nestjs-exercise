import { Task } from '../../tasks/entities/task.entity';

export interface IUser {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
  tasks: Task[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserWithTasks extends IUserResponse {
  tasks: Task[];
} 