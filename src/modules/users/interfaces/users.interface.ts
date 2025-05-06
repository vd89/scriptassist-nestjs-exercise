import { Task } from '../../tasks/entities/task.entity';
import { Role } from '@common/enums/role.enum';

export interface IUser {
  id: string;
  email: string;
  name: string;
  password: string;
  role: Role;
  tasks: Task[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserWithTasks extends IUserResponse {
  tasks: Task[];
} 