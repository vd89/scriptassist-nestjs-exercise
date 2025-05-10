import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

/**
 * Entity representing a task in the system.
 *
 * This entity stores all information related to a task including its title,
 * description, status, priority, due date, and relationship with other entities.
 *
 * @entity Task
 * @table tasks
 */
@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  @Column({ type: 'timestamp', nullable: true, name: 'due_date' })
  dueDate: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: any;

  @OneToMany('TaskComment', 'task')
  comments: any[];

  @OneToMany('TaskAttachment', 'task')
  attachments: any[];

  @OneToMany('TaskHistory', 'task')
  history: any[];

  @OneToMany('TaskDependency', 'task')
  dependencies: any[];

  @OneToMany('TaskDependency', 'dependentTask')
  dependentTasks: any[];
}
