import { User } from '../entities/user.entity';
import { EntityId } from '../value-objects/entity-id.value-object';
import { Email } from '../value-objects/email.value-object';

export interface UserRepository {
  findById(id: EntityId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  save(user: User): Promise<User>;
  delete(id: EntityId): Promise<void>;
  findAll(): Promise<User[]>;
  exists(id: EntityId): Promise<boolean>;
}
