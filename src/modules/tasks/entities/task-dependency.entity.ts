import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export type DependencyType = 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO';

@Entity('task_dependencies')
export class TaskDependency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @Column()
  dependentTaskId: string;

  @Column({ type: 'enum', enum: ['BLOCKS', 'BLOCKED_BY', 'RELATES_TO'] })
  type: DependencyType;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Task', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: any;

  @ManyToOne('Task', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dependentTaskId' })
  dependentTask: any;
}
