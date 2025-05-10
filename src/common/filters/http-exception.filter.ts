import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details = null;

    // Handle HttpException (NestJS built-in exceptions)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        error = (exceptionResponse as any).error || exception.name;
        details = (exceptionResponse as any).details;
      } else {
        message = exception.message;
        error = exception.name;
      }
    }
    // Handle TypeORM QueryFailedError
    else if (exception instanceof QueryFailedError) {
      const queryError = exception as any;

      // Handle unique constraint violations
      if (queryError.code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists';
        error = 'Conflict';

        // Extract field name from PostgreSQL error detail
        const detail = queryError.detail || '';
        const match = detail.match(/Key \((.*?)\)=/);
        if (match && match[1]) {
          const field = match[1].replace(/[()]/g, '');
          message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
        }
      }
      // Handle foreign key violations
      else if (queryError.code === '23503') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced resource does not exist';
        error = 'Bad Request';
      }
      // Handle invalid input syntax
      else if (queryError.code === '22P02') {
        status = HttpStatus.BAD_REQUEST;
        error = 'Bad Request';

        // Handle UUID format errors
        if (queryError.message.includes('uuid')) {
          message = 'Invalid ID format';
          details = {
            type: 'uuid',
            message: 'The provided ID is not in a valid UUID format',
          };
        }
        // Handle other type conversion errors
        else {
          message = 'Invalid input format';
          details = {
            message: queryError.message,
          };
        }
      }
      // Handle other database errors
      else {
        this.logger.error(`Database error: ${queryError.message}`, queryError.stack);
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid request';
        error = 'Bad Request';
        details = {
          type: 'database_error',
          code: queryError.code,
        };
      }
    }
    // Handle other errors
    else {
      this.logger.error(
        `Unexpected error: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Log the error with appropriate level
    if (status >= 500) {
      this.logger.error(`[${request.method}] ${request.url} - ${status} ${message}`, {
        error,
        details,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.warn(`[${request.method}] ${request.url} - ${status} ${message}`, {
        error,
        details,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      });
    }

    // Send response
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    });
  }
}
