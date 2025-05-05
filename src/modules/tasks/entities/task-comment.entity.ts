import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('task_comments')
export class TaskComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: any;

  @ManyToOne('Task', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: any;
}
