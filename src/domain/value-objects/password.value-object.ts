import { ValueObject } from './value-object.base';

interface PasswordProps {
  value: string;
}

export class Password extends ValueObject<PasswordProps> {
  private static readonly MIN_LENGTH = 8;
  private static readonly MAX_LENGTH = 100;
  private static readonly STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

  constructor(props: PasswordProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(password: string): Password {
    const instance = new Password({ value: password });
    instance.validate();
    return instance;
  }

  static createFromHash(hashedPassword: string): Password {
    return new Password({ value: hashedPassword });
  }

  private validate(): void {
    if (!this.props.value) {
      throw new Error('Password cannot be empty');
    }

    if (this.props.value.length < Password.MIN_LENGTH) {
      throw new Error(`Password must be at least ${Password.MIN_LENGTH} characters long`);
    }

    if (this.props.value.length > Password.MAX_LENGTH) {
      throw new Error(`Password must not exceed ${Password.MAX_LENGTH} characters`);
    }

    if (!Password.STRONG_PASSWORD_REGEX.test(this.props.value)) {
      throw new Error('Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character');
    }
  }

  toString(): string {
    return '[PROTECTED]';
  }
}
