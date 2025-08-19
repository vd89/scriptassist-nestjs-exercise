import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from './value-object.base';

interface EntityIdProps {
  value: string;
}

export class EntityId extends ValueObject<EntityIdProps> {
  constructor(props: EntityIdProps) {
    super(props);
    this.validate();
  }

  private validate(): void {
    if (!this.props.value) {
      throw new Error('Entity ID cannot be empty');
    }

    if (!uuidValidate(this.props.value)) {
      throw new Error('Entity ID must be a valid UUID');
    }
  }

  get value(): string {
    return this.props.value;
  }

  static create(id?: string): EntityId {
    return new EntityId({ value: id || uuidv4() });
  }

  static fromString(id: string): EntityId {
    return new EntityId({ value: id });
  }

  toString(): string {
    return this.props.value;
  }
}
