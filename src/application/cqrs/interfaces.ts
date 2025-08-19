/**
 * Base command interface
 */
export interface ICommand {
  readonly commandId: string;
  readonly timestamp: Date;
  readonly userId?: string;
}

/**
 * Base query interface
 */
export interface IQuery {
  readonly queryId: string;
  readonly timestamp: Date;
  readonly userId?: string;
}

/**
 * Command handler interface
 */
export interface ICommandHandler<TCommand extends ICommand, TResult = any> {
  handle(command: TCommand): Promise<TResult>;
}

/**
 * Query handler interface
 */
export interface IQueryHandler<TQuery extends IQuery, TResult = any> {
  handle(query: TQuery): Promise<TResult>;
}

/**
 * Command bus interface
 */
export interface ICommandBus {
  execute<TCommand extends ICommand, TResult = any>(
    command: TCommand
  ): Promise<TResult>;

  register<TCommand extends ICommand, TResult = any>(
    commandType: new (...args: any[]) => TCommand,
    handler: ICommandHandler<TCommand, TResult>
  ): void;
}

/**
 * Query bus interface
 */
export interface IQueryBus {
  execute<TQuery extends IQuery, TResult = any>(
    query: TQuery
  ): Promise<TResult>;

  register<TQuery extends IQuery, TResult = any>(
    queryType: new (...args: any[]) => TQuery,
    handler: IQueryHandler<TQuery, TResult>
  ): void;
}

/**
 * CQRS mediator interface
 */
export interface ICQRSMediator {
  send<TCommand extends ICommand, TResult = any>(
    command: TCommand
  ): Promise<TResult>;

  query<TQuery extends IQuery, TResult = any>(
    query: TQuery
  ): Promise<TResult>;
}
