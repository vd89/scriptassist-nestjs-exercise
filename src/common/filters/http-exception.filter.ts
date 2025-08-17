import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Error response interface for consistent error handling
 */
interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  // Include a correlation ID for better debugging and tracking
  correlationId: string;
  // Only include stack trace in development
  stack?: string;
}

/**
 * Enhanced HTTP exception filter
 * - Logs errors with appropriate severity levels
 * - Formats error responses consistently
 * - Includes relevant details without exposing sensitive information
 * - Handles different types of errors with appropriate status codes
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(private configService: ConfigService) {
    // Check if we're in production mode to handle sensitive data
    this.isProduction = configService.get('NODE_ENV') === 'production';
  }

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Generate a correlation ID for tracking the error
    const correlationId = this.generateCorrelationId();

    // Determine the HTTP status code and get response details
    const { status, responseBody } = this.getResponseDetails(exception, request, correlationId);

    // Log the error with appropriate level based on severity
    this.logException(exception, status, request, correlationId);

    // Send the response
    response.status(status).json(responseBody);
  }

  private getResponseDetails(
    exception: Error,
    request: Request,
    correlationId: string,
  ): { status: number; responseBody: ErrorResponse } {
    let status: number;
    let message: string | string[];
    let error: string;

    // Handle different types of exceptions
    if (exception instanceof HttpException) {
      // If it's an HTTP exception, use its status and response
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Extract message and error from the exception response
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || exception.message;
        error = (exceptionResponse as any).error || HttpStatus[status];
      } else {
        message = exception.message;
        error = HttpStatus[status];
      }
    } else {
      // For unexpected errors, use 500 Internal Server Error
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = this.isProduction
        ? 'Internal server error'
        : exception.message || 'Internal server error';
      error = 'Internal Server Error';
    }

    // Create consistent error response
    const responseBody: ErrorResponse = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    // Only include stack trace in non-production environments
    if (!this.isProduction && exception.stack) {
      responseBody.stack = exception.stack;
    }

    return { status, responseBody };
  }

  private logException(
    exception: Error,
    status: number,
    request: Request,
    correlationId: string,
  ): void {
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const ip = request.ip || 'unknown';

    // Create log message with relevant context
    const logContext = {
      correlationId,
      method,
      url,
      ip,
      userAgent,
    };

    // Choose logging level based on status code
    if (status >= 500) {
      // Server errors
      this.logger.error(
        `[${correlationId}] ${method} ${url} - ${status} ${exception.message}`,
        exception.stack,
        logContext,
      );
    } else if (status >= 400) {
      // Client errors
      this.logger.warn(
        `[${correlationId}] ${method} ${url} - ${status} ${exception.message}`,
        logContext,
      );
    } else {
      // Unexpected non-error status codes
      this.logger.log(
        `[${correlationId}] ${method} ${url} - ${status} ${exception.message}`,
        logContext,
      );
    }
  }

  private generateCorrelationId(): string {
    // Generate a random correlation ID for tracking
    return `err-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
