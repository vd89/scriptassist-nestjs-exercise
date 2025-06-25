import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
  AfterInsert,
  BeforeInsert,
} from 'typeorm';
import { User } from '@modules/users/entities/user.entity';
import dataSource from '@database/data-source';
@Entity('refresh_token')
@Index(['userId', 'blacklisted'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  token: string;

  @Column({ type: 'boolean', default: false })
  blacklisted: boolean;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @ManyToOne(() => User, user => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @BeforeInsert()
  setDefaultExpiry() {
    if (!this.expiresAt) {
      const now = new Date();
      now.setDate(now.getDate() + 30);
      this.expiresAt = now;
    }
  }
}
