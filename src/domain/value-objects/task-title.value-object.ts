import { ValueObject } from './value-object.base';

interface TaskTitleProps {
  value: string;
}

export class TaskTitle extends ValueObject<TaskTitleProps> {
  private static readonly MIN_LENGTH = 3;
  private static readonly MAX_LENGTH = 100;

  constructor(props: TaskTitleProps) {
    super(props);
    this.validate();
  }

  private validate(): void {
    if (!this.props.value) {
      throw new Error('Task title cannot be empty');
    }

    const trimmedValue = this.props.value.trim();

    if (trimmedValue.length < TaskTitle.MIN_LENGTH) {
      throw new Error(`Task title must be at least ${TaskTitle.MIN_LENGTH} characters long`);
    }

    if (trimmedValue.length > TaskTitle.MAX_LENGTH) {
      throw new Error(`Task title must not exceed ${TaskTitle.MAX_LENGTH} characters`);
    }
  }

  get value(): string {
    return this.props.value;
  }

  static create(title: string): TaskTitle {
    return new TaskTitle({ value: title.trim() });
  }

  toString(): string {
    return this.props.value;
  }
}
