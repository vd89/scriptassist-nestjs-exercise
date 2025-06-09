import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';
import { Exclude } from 'class-transformer';
import { AVAILABLE_ROLES } from '../../auth/constants/permissions';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  @Index()
  @Column()
  name: string;

  @Column()
  @Exclude({ toPlainOnly: true })
  password: string;

  @Index()
  @Column({ 
    default: 'user',
    enum: AVAILABLE_ROLES,
    type: 'enum' 
  })
  role: string;

  @Column({ nullable: true, type: 'varchar' })
  @Exclude({ toPlainOnly: true })
  resetToken: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  @Exclude({ toPlainOnly: true })
  resetTokenExpires: Date | null;

  @OneToMany(() => Task, (task) => task.user)
  tasks: Task[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
} 