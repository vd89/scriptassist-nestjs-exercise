import { AggregateRoot } from './aggregate-root.base';
import { EntityId } from '../value-objects/entity-id.value-object';
import { Email } from '../value-objects/email.value-object';
import { UserName } from '../value-objects/user-name.value-object';
import { Password } from '../value-objects/password.value-object';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

interface UserProps {
  email: Email;
  name: UserName;
  password: Password;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export class User extends AggregateRoot<UserProps> {
  constructor(props: UserProps, id?: EntityId) {
    super(props, id);
  }

  static create(props: {
    email: string;
    name: string;
    password: string;
    role?: UserRole;
  }, id?: EntityId): User {
    const userProps: UserProps = {
      email: Email.create(props.email),
      name: UserName.create(props.name),
      password: Password.create(props.password),
      role: props.role || UserRole.USER,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return new User(userProps, id);
  }

  static createFromPersistence(props: {
    email: string;
    name: string;
    hashedPassword: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
  }, id: EntityId): User {
    const userProps: UserProps = {
      email: Email.create(props.email),
      name: UserName.create(props.name),
      password: Password.createFromHash(props.hashedPassword),
      role: props.role,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };

    return new User(userProps, id);
  }

  get email(): Email {
    return this.props.email;
  }

  get name(): UserName {
    return this.props.name;
  }

  get password(): Password {
    return this.props.password;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public updateEmail(email: string): void {
    this.props.email = Email.create(email);
    this.props.updatedAt = new Date();
  }

  public updateName(name: string): void {
    this.props.name = UserName.create(name);
    this.props.updatedAt = new Date();
  }

  public updatePassword(password: string): void {
    this.props.password = Password.create(password);
    this.props.updatedAt = new Date();
  }

  public updateRole(role: UserRole): void {
    this.props.role = role;
    this.props.updatedAt = new Date();
  }

  public isAdmin(): boolean {
    return this.props.role === UserRole.ADMIN;
  }

  public canAccessTask(taskUserId: EntityId): boolean {
    return this.isAdmin() || this._id.equals(taskUserId);
  }
}
