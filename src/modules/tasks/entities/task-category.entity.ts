import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Task } from './task.entity';

@Entity('task_categories')
export class TaskCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  color: string;

  @ManyToMany(() => Task)
  @JoinTable({
    name: 'task_category_relations',
    joinColumn: { name: 'category_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'task_id', referencedColumnName: 'id' },
  })
  tasks: Task[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
