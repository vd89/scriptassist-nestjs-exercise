import { EntityId } from '../value-objects/entity-id.value-object';

export abstract class AggregateRoot<T> {
  protected readonly _id: EntityId;
  protected props: T;
  private _domainEvents: any[] = [];

  constructor(props: T, id?: EntityId) {
    this._id = id || EntityId.create();
    this.props = props;
  }

  get id(): EntityId {
    return this._id;
  }

  public equals(object?: AggregateRoot<T>): boolean {
    if (object === null || object === undefined) {
      return false;
    }

    if (this === object) {
      return true;
    }

    return this._id.equals(object._id);
  }

  protected addDomainEvent(domainEvent: any): void {
    this._domainEvents.push(domainEvent);
  }

  public clearEvents(): void {
    this._domainEvents.splice(0, this._domainEvents.length);
  }

  get domainEvents(): any[] {
    return this._domainEvents;
  }
}
