import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { CreateInitialSchema1710752400000 } from './migrations/1710752400000-CreateInitialSchema';
import { UserModel } from '../infrastructure/persistence/entities/user.model';
import { TaskModel } from '../infrastructure/persistence/entities/task.model';
// Keep original entities for backward compatibility
import { User } from '../modules/users/entities/user.entity';
import { Task } from '../modules/tasks/entities/task.entity';

// Load environment variables
dotenv.config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'task_manager',
  entities: [
    UserModel,
    TaskModel,
    User, // Keep for backward compatibility
    Task, // Keep for backward compatibility
  ],
  migrations: [CreateInitialSchema1710752400000],
  migrationsTableName: 'migrations',
  synchronize: false, // Important: Set to false for production
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
