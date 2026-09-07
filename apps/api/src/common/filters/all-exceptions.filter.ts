import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ErrorResponseBody {
  statusCode: number;
  message: string;
  errors?: readonly { path: string; message: string }[];
  path: string;
  timestamp: string;
}

/**
 * One error shape for the whole API, so the client has a single contract to
 * handle. Unexpected errors are logged with their stack but answered with a
 * generic message — internals never reach the wire.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponseBody = {
      statusCode: status,
      ...this.describe(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private describe(
    exception: unknown,
    status: number,
  ): Pick<ErrorResponseBody, 'message' | 'errors'> {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return { message: 'Internal server error' };
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { message: payload };
      }

      const record = payload as Record<string, unknown>;
      const message = record['message'];
      const errors = record['errors'];

      return {
        message: Array.isArray(message)
          ? message.join(', ')
          : typeof message === 'string'
            ? message
            : exception.message,
        ...(Array.isArray(errors)
          ? { errors: errors as ErrorResponseBody['errors'] }
          : {}),
      };
    }

    return { message: 'Unexpected error' };
  }
}
