import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus } from '../cqrs/command-bus';
import { QueryBus } from '../cqrs/query-bus';
import { CQRSMediator } from '../cqrs/cqrs-mediator';
import { ICommand, IQuery, ICommandHandler, IQueryHandler } from '../cqrs/interfaces';
import { v4 as uuidv4 } from 'uuid';

// Test Command
class TestCommand implements ICommand {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();
  constructor(public readonly data: string) {}
}

// Test Query
class TestQuery implements IQuery {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();
  constructor(public readonly filter: string) {}
}

// Test Command Handler
class TestCommandHandler implements ICommandHandler<TestCommand, string> {
  async handle(command: TestCommand): Promise<string> {
    return `Handled: ${command.data}`;
  }
}

// Test Query Handler
class TestQueryHandler implements IQueryHandler<TestQuery, string[]> {
  async handle(query: TestQuery): Promise<string[]> {
    return [`Result for: ${query.filter}`];
  }
}

describe('CQRS Infrastructure', () => {
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let mediator: CQRSMediator;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CommandBus,
        QueryBus,
        CQRSMediator,
        TestCommandHandler,
        TestQueryHandler
      ]
    }).compile();

    commandBus = module.get<CommandBus>(CommandBus);
    queryBus = module.get<QueryBus>(QueryBus);
    mediator = module.get<CQRSMediator>(CQRSMediator);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('CommandBus', () => {
    it('should register and execute commands', async () => {
      const handler = module.get<TestCommandHandler>(TestCommandHandler);
      commandBus.register(TestCommand, handler);

      const command = new TestCommand('test data');
      const result = await commandBus.execute(command);

      expect(result).toBe('Handled: test data');
    });

    it('should throw error for unregistered command', async () => {
      const command = new TestCommand('test data');
      
      await expect(commandBus.execute(command)).rejects.toThrow(
        'No handler registered for command: TestCommand'
      );
    });

    it('should track registered commands', () => {
      const handler = module.get<TestCommandHandler>(TestCommandHandler);
      commandBus.register(TestCommand, handler);

      expect(commandBus.getRegisteredCommands()).toContain('TestCommand');
      expect(commandBus.isHandlerRegistered(TestCommand)).toBe(true);
    });
  });

  describe('QueryBus', () => {
    it('should register and execute queries', async () => {
      const handler = module.get<TestQueryHandler>(TestQueryHandler);
      queryBus.register(TestQuery, handler);

      const query = new TestQuery('test filter');
      const result = await queryBus.execute(query);

      expect(result).toEqual(['Result for: test filter']);
    });

    it('should throw error for unregistered query', async () => {
      const query = new TestQuery('test filter');
      
      await expect(queryBus.execute(query)).rejects.toThrow(
        'No handler registered for query: TestQuery'
      );
    });

    it('should track registered queries', () => {
      const handler = module.get<TestQueryHandler>(TestQueryHandler);
      queryBus.register(TestQuery, handler);

      expect(queryBus.getRegisteredQueries()).toContain('TestQuery');
      expect(queryBus.isHandlerRegistered(TestQuery)).toBe(true);
    });
  });

  describe('CQRSMediator', () => {
    beforeEach(() => {
      const commandHandler = module.get<TestCommandHandler>(TestCommandHandler);
      const queryHandler = module.get<TestQueryHandler>(TestQueryHandler);
      
      commandBus.register(TestCommand, commandHandler);
      queryBus.register(TestQuery, queryHandler);
    });

    it('should send commands through command bus', async () => {
      const command = new TestCommand('mediator test');
      const result = await mediator.send(command);

      expect(result).toBe('Handled: mediator test');
    });

    it('should execute queries through query bus', async () => {
      const query = new TestQuery('mediator filter');
      const result = await mediator.query(query);

      expect(result).toEqual(['Result for: mediator filter']);
    });
  });

  describe('Error Handling', () => {
    it('should handle command handler errors', async () => {
      class ErrorCommand implements ICommand {
        readonly commandId: string = uuidv4();
        readonly timestamp: Date = new Date();
      }

      class ErrorCommandHandler implements ICommandHandler<ErrorCommand, void> {
        async handle(): Promise<void> {
          throw new Error('Command handler error');
        }
      }

      const errorHandler = new ErrorCommandHandler();
      commandBus.register(ErrorCommand, errorHandler);

      const command = new ErrorCommand();
      
      await expect(commandBus.execute(command)).rejects.toThrow('Command handler error');
    });

    it('should handle query handler errors', async () => {
      class ErrorQuery implements IQuery {
        readonly queryId: string = uuidv4();
        readonly timestamp: Date = new Date();
      }

      class ErrorQueryHandler implements IQueryHandler<ErrorQuery, void> {
        async handle(): Promise<void> {
          throw new Error('Query handler error');
        }
      }

      const errorHandler = new ErrorQueryHandler();
      queryBus.register(ErrorQuery, errorHandler);

      const query = new ErrorQuery();
      
      await expect(queryBus.execute(query)).rejects.toThrow('Query handler error');
    });
  });
});
