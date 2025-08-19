import { ValueObject } from './value-object.base';

interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private static readonly EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  constructor(props: EmailProps) {
    super(props);
    this.validate();
  }

  private validate(): void {
    if (!this.props.value) {
      throw new Error('Email cannot be empty');
    }

    if (!Email.EMAIL_REGEX.test(this.props.value)) {
      throw new Error('Invalid email format');
    }

    if (this.props.value.length > 254) {
      throw new Error('Email is too long');
    }
  }

  get value(): string {
    return this.props.value;
  }

  static create(email: string): Email {
    return new Email({ value: email.toLowerCase().trim() });
  }

  toString(): string {
    return this.props.value;
  }
}
