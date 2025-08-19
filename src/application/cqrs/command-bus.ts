import { Injectable, Logger } from '@nestjs/common';
import { ICommand, ICommandHandler, ICommandBus } from './interfaces';

/**
 * In-memory command bus implementation
 */
@Injectable()
export class CommandBus implements ICommandBus {
  private readonly logger = new Logger(CommandBus.name);
  private readonly handlers = new Map<string, ICommandHandler<any, any>>();

  async execute<TCommand extends ICommand, TResult = any>(
    command: TCommand
  ): Promise<TResult> {
    const commandName = command.constructor.name;
    this.logger.debug(`Executing command: ${commandName}`, {
      commandId: command.commandId,
      timestamp: command.timestamp
    });

    const handler = this.handlers.get(commandName);
    if (!handler) {
      throw new Error(`No handler registered for command: ${commandName}`);
    }

    try {
      const startTime = Date.now();
      const result = await handler.handle(command);
      const duration = Date.now() - startTime;

      this.logger.debug(`Command executed successfully: ${commandName}`, {
        commandId: command.commandId,
        duration
      });

      return result;
    } catch (error) {
      this.logger.error(`Command execution failed: ${commandName}`, {
        commandId: command.commandId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  register<TCommand extends ICommand, TResult = any>(
    commandType: new (...args: any[]) => TCommand,
    handler: ICommandHandler<TCommand, TResult>
  ): void {
    const commandName = commandType.name;
    this.logger.debug(`Registering command handler: ${commandName}`);
    this.handlers.set(commandName, handler);
  }

  /**
   * Get all registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a command handler is registered
   */
  isHandlerRegistered(commandType: new (...args: any[]) => ICommand): boolean {
    return this.handlers.has(commandType.name);
  }
}
