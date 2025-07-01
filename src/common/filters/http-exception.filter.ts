import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    let responseBody: any;

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse.hasOwnProperty('statusCode')
    ) {
      responseBody = {
        ...exceptionResponse,
        status_code: exceptionResponse['statusCode'],
      };
      delete responseBody['statusCode'];
    } else {
      responseBody = {
        status_code: status,
        error: exceptionResponse,
      };
    }

    response.status(status).send(responseBody);
  }
}
