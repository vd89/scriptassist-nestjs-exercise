import { User } from '../entities/user.entity';
import { EntityId } from '../value-objects/entity-id.value-object';
import { Email } from '../value-objects/email.value-object';
import { BaseRepository } from './base.repository.interface';

export interface UserRepository extends BaseRepository<User> {
  // Base methods inherited from BaseRepository
  findByEmail(email: Email): Promise<User | null>;
  findAll(): Promise<User[]>;
}
