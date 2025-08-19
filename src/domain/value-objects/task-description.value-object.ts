import { ValueObject } from './value-object.base';

interface TaskDescriptionProps {
  value: string | null;
}

export class TaskDescription extends ValueObject<TaskDescriptionProps> {
  private static readonly MAX_LENGTH = 1000;

  constructor(props: TaskDescriptionProps) {
    super(props);
    this.validate();
  }

  private validate(): void {
    if (this.props.value && this.props.value.trim().length > TaskDescription.MAX_LENGTH) {
      throw new Error(`Task description must not exceed ${TaskDescription.MAX_LENGTH} characters`);
    }
  }

  get value(): string | null {
    return this.props.value;
  }

  static create(description: string | null): TaskDescription {
    return new TaskDescription({ 
      value: description ? description.trim() || null : null 
    });
  }

  toString(): string {
    return this.props.value || '';
  }

  isEmpty(): boolean {
    return !this.props.value || this.props.value.trim().length === 0;
  }
}
