import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpResponse } from '../../types/http-response.interface';

/**
 * Global HTTP exception filter that handles all HTTP exceptions in the application.
 * This filter:
 * 1. Logs errors with appropriate severity levels
 * 2. Formats error responses consistently
 * 3. Provides meaningful error messages without exposing sensitive information
 * 4. Handles different types of errors with appropriate status codes
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  // Initialize logger with the filter's class name for better log identification
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * Main method that catches and processes HTTP exceptions.
   * Extracts necessary information from the exception and host,
   * logs the error, formats the response, and sends it back to the client.
   * 
   * @param exception The caught HTTP exception
   * @param host The arguments host containing request/response context
   */
  catch(exception: HttpException, host: ArgumentsHost) {
    // Extract HTTP context from the host
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Log the error with appropriate severity
    this.logError(exception, request);

    // Format the error response according to our standard format
    const errorResponse: HttpResponse<null> = this.formatErrorResponse(exception, request, status);

    // Send the formatted response back to the client
    response.status(status).json(errorResponse);
  }

  /**
   * Logs the error with appropriate severity based on the HTTP status code.
   * Includes contextual information like path, method, and timestamp.
   * 
   * @param exception The HTTP exception to log
   * @param request The current request object
   */
  private logError(exception: HttpException, request: Request): void {
    // Extract status code and prepare error context
    const status = exception.getStatus();
    const errorContext = {
      path: request.url,
      method: request.method,
      statusCode: status,
      timestamp: new Date().toISOString(),
    };

    // Log based on error severity:
    // - ERROR for server errors (500+)
    // - WARN for client errors (400-499)
    // - DEBUG for other errors
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Server Error: ${exception.message}`,
        {
          ...errorContext,
          stack: exception.stack, // Include stack trace for server errors
        },
      );
    } else if (status >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(
        `Client Error: ${exception.message}`,
        errorContext,
      );
    } else {
      this.logger.debug(
        `Other Error: ${exception.message}`,
        errorContext,
      );
    }
  }

  /**
   * Formats the error response according to our standard format.
   * Includes success flag, error message, error type, path, and timestamp.
   * 
   * @param exception The HTTP exception
   * @param request The current request
   * @param status The HTTP status code
   * @returns Formatted error response
   */
  private formatErrorResponse(
    exception: HttpException,
    request: Request,
    status: number,
  ): HttpResponse<null> {
    // Get the exception response and extract the error message
    const exceptionResponse = exception.getResponse();
    const errorMessage = this.getErrorMessage(exceptionResponse);

    // Return the formatted response
    return {
      success: false,
      message: errorMessage,
      error: this.getErrorType(status),
      path: request.url,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extracts a meaningful error message from the exception response.
   * Handles different response formats (string, object with message, array of messages).
   * 
   * @param exceptionResponse The exception response to process
   * @returns A formatted error message
   */
  private getErrorMessage(exceptionResponse: string | object): string {
    // Handle string responses directly
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    // Handle object responses with message property
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as { message?: string | string[] };
      if ('message' in responseObj) {
        // Handle array of messages (take first message)
        if (Array.isArray(responseObj.message)) {
          return responseObj.message[0] || 'An unexpected error occurred';
        }
        // Handle single message
        return responseObj.message || 'An unexpected error occurred';
      }
    }

    // Fallback message if no valid message found
    return 'An unexpected error occurred';
  }

  /**
   * Determines the error type based on the HTTP status code.
   * Maps status codes to meaningful error types for client consumption.
   * 
   * @param status The HTTP status code
   * @returns A human-readable error type
   */
  private getErrorType(status: number): string {
    // Map status codes to error types
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Internal Server Error';
    }
    if (status >= HttpStatus.BAD_REQUEST) {
      return 'Bad Request';
    }
    if (status >= HttpStatus.UNAUTHORIZED) {
      return 'Unauthorized';
    }
    if (status >= HttpStatus.FORBIDDEN) {
      return 'Forbidden';
    }
    if (status >= HttpStatus.NOT_FOUND) {
      return 'Not Found';
    }
    return 'Unknown Error';
  }
} 