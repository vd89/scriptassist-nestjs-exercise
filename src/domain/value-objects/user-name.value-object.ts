import { ValueObject } from './value-object.base';

interface UserNameProps {
  value: string;
}

export class UserName extends ValueObject<UserNameProps> {
  private static readonly MIN_LENGTH = 2;
  private static readonly MAX_LENGTH = 50;
  private static readonly NAME_REGEX = /^[a-zA-Z\s\-'\.]+$/;

  constructor(props: UserNameProps) {
    super(props);
    this.validate();
  }

  private validate(): void {
    if (!this.props.value) {
      throw new Error('Name cannot be empty');
    }

    const trimmedValue = this.props.value.trim();

    if (trimmedValue.length < UserName.MIN_LENGTH) {
      throw new Error(`Name must be at least ${UserName.MIN_LENGTH} characters long`);
    }

    if (trimmedValue.length > UserName.MAX_LENGTH) {
      throw new Error(`Name must not exceed ${UserName.MAX_LENGTH} characters`);
    }

    if (!UserName.NAME_REGEX.test(trimmedValue)) {
      throw new Error('Name can only contain letters, spaces, hyphens, apostrophes, and periods');
    }
  }

  get value(): string {
    return this.props.value;
  }

  static create(name: string): UserName {
    return new UserName({ value: name.trim() });
  }

  toString(): string {
    return this.props.value;
  }
}
