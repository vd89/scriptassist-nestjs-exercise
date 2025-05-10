import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaskHistoryAction } from '../enums/task-history-action.enum';

@Entity('task_history')
export class TaskHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: TaskHistoryAction,
  })
  action: TaskHistoryAction;

  @Column({ type: 'jsonb', nullable: true })
  oldValue: any;

  @Column({ type: 'jsonb', nullable: true })
  newValue: any;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: any;

  @ManyToOne('Task', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: any;
}
