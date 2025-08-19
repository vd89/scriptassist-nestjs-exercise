import { User, UserRole } from '../../../domain/entities/user.entity';
import { UserModel } from '../entities/user.model';
import { EntityId } from '../../../domain/value-objects/entity-id.value-object';

export class UserMapper {
  static toDomain(userModel: UserModel): User {
    return User.createFromPersistence(
      {
        email: userModel.email,
        name: userModel.name,
        hashedPassword: userModel.password,
        role: userModel.role as UserRole,
        createdAt: userModel.createdAt,
        updatedAt: userModel.updatedAt,
      },
      EntityId.fromString(userModel.id),
    );
  }

  static toPersistence(user: User): UserModel {
    const userModel = new UserModel();
    userModel.id = user.id.value;
    userModel.email = user.email.value;
    userModel.name = user.name.value;
    userModel.password = user.password.value;
    userModel.role = user.role;
    userModel.createdAt = user.createdAt;
    userModel.updatedAt = user.updatedAt;
    return userModel;
  }

  static toPartialPersistence(user: User): Partial<UserModel> {
    return {
      id: user.id.value,
      email: user.email.value,
      name: user.name.value,
      password: user.password.value,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
