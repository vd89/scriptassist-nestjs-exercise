import { ValidationPipe, ValidationPipeOptions, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export class CustomValidationPipe extends ValidationPipe {
  constructor(options?: ValidationPipeOptions) {
    super({
      whitelist: true, // Strip properties that don't have decorators
      transform: true, // Transform payloads to DTO instances
      forbidNonWhitelisted: true, // Throw errors if non-whitelisted properties are present
      transformOptions: {
        enableImplicitConversion: true, // Enable automatic type conversion
      },
      validateCustomDecorators: true, // Enable validation of custom decorators
      forbidUnknownValues: true, // Throw errors if unknown properties are present
      exceptionFactory: (errors) => {
        // Enhanced error messages with more details
        const messages = errors.map(error => {
          const constraints = error.constraints || {};
          const property = error.property;
          const value = error.value;
          const children = error.children || [];
          
          // Format validation errors
          const formattedErrors = Object.entries(constraints).map(([key, message]) => ({
            type: key,
            message,
            property,
            value: value !== undefined ? String(value).substring(0, 100) : undefined, // Truncate long values
          }));

          // Handle nested validation errors
          const nestedErrors = children.map(child => {
            const childConstraints = child.constraints || {};
            return Object.entries(childConstraints).map(([key, message]) => ({
              type: key,
              message,
              property: `${property}.${child.property}`,
              value: child.value !== undefined ? String(child.value).substring(0, 100) : undefined,
            }));
          }).flat();

          return [...formattedErrors, ...nestedErrors];
        }).flat();

        // Throw a BadRequestException with detailed error information
        throw new BadRequestException({
          message: 'Validation failed',
          errors: messages,
          timestamp: new Date().toISOString(),
        });
      },
      ...options,
    });
  }

  /**
   * Override the transform method to add additional security checks
   */
  async transform(value: any, metadata: any) {
    // First, perform the standard transformation
    const transformed = await super.transform(value, metadata);

    // Additional security checks
    if (transformed && typeof transformed === 'object') {
      // Sanitize string values to prevent XSS
      this.sanitizeObject(transformed);
    }

    return transformed;
  }

  /**
   * Recursively sanitize object values to prevent XSS
   */
  private sanitizeObject(obj: any) {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        // Basic XSS prevention
        obj[key] = obj[key]
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key]);
      }
    });
  }
} 