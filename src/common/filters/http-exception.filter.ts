import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ValidationError } from 'class-validator';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status: number;
    let message: any; // Using any for internal processing
    let error: string;
    
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        const exceptionResponseObj = exceptionResponse as any;
        message = exceptionResponseObj.message || exception.message;
        error = exceptionResponseObj.error || 'Error';
      } else {
        message = exception.message;
        error = HttpStatus[status];
      }
    } else {
      // For unhandled errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
      
      // Log unhandled errors with full stack trace
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }
    
    // Format validation errors in a consistent way
    let formattedMessage: string | string[] = typeof message === 'string' 
      ? message 
      : Array.isArray(message) ? message as string[] : [String(message)];
    
    if (Array.isArray(message) && message.some(item => typeof item === 'object' && 'constraints' in item)) {
      formattedMessage = this.formatValidationErrors(message as unknown as ValidationError[]);
    }
    
    response.status(status).json({
      success: false,
      statusCode: status,
      message: formattedMessage,
      error: error,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Helper method to format validation errors
  private formatValidationErrors(errors: ValidationError[]): string[] {
    const formattedErrors: string[] = [];
    
    errors.forEach(error => {
      if (error.constraints) {
        Object.values(error.constraints).forEach(constraint => {
          formattedErrors.push(constraint);
        });
      }
      
      if (error.children && error.children.length > 0) {
        const childErrors = this.formatValidationErrors(error.children);
        formattedErrors.push(...childErrors);
      }
    });
    
    return formattedErrors;
  }
} 