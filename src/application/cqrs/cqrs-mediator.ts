import { Injectable } from '@nestjs/common';
import { ICommand, IQuery, ICQRSMediator } from './interfaces';
import { CommandBus } from './command-bus';
import { QueryBus } from './query-bus';

/**
 * CQRS mediator implementation
 */
@Injectable()
export class CQRSMediator implements ICQRSMediator {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  async send<TCommand extends ICommand, TResult = any>(
    command: TCommand
  ): Promise<TResult> {
    return await this.commandBus.execute(command);
  }

  async query<TQuery extends IQuery, TResult = any>(
    query: TQuery
  ): Promise<TResult> {
    return await this.queryBus.execute(query);
  }
}
