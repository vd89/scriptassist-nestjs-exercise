import { ValueObject } from './value-object.base';

export interface DueDateProps {
  value: Date | null;
}

export class DueDate extends ValueObject<DueDateProps> {
  constructor(props: DueDateProps) {
    super(props);
    this.validate();
  }

  private validate(): void {
    if (this.props.value && isNaN(this.props.value.getTime())) {
      throw new Error('Invalid due date');
    }
  }

  get value(): Date | null {
    return this.props.value;
  }

  static create(date: Date | string | null): DueDate {
    if (!date) {
      return new DueDate({ value: null });
    }

    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    return new DueDate({ value: parsedDate });
  }

  static createWithValidation(date: Date | string | null): DueDate {
    const dueDate = DueDate.create(date);

    if (dueDate.value && dueDate.isPast()) {
      throw new Error('Due date cannot be in the past');
    }

    return dueDate;
  }

  isPast(): boolean {
    if (!this.props.value) return false;
    return this.props.value < new Date();
  }

  isFuture(): boolean {
    if (!this.props.value) return false;
    return this.props.value > new Date();
  }

  isToday(): boolean {
    if (!this.props.value) return false;
    const today = new Date();
    const dueDate = this.props.value;

    return (
      dueDate.getFullYear() === today.getFullYear() &&
      dueDate.getMonth() === today.getMonth() &&
      dueDate.getDate() === today.getDate()
    );
  }

  toString(): string {
    return this.props.value ? this.props.value.toISOString() : '';
  }
}
