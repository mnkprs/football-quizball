import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogService } from '../../admin/error-log.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Optional() private errorLogService?: ErrorLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as Record<string, unknown>)?.message ?? exception.message
        : 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );

      if (this.errorLogService) {
        try {
          // bufferError is synchronous (array push only), so re-entrancy is impossible
          this.errorLogService.bufferError({
            level: 'error',
            context: AllExceptionsFilter.name,
            message: `[${request.method}] ${request.url} → ${status}`,
            stack: exception instanceof Error ? exception.stack : String(exception),
            metadata: { method: request.method, url: request.url, statusCode: status },
          });
        } catch (e) {
          console.error('[AllExceptionsFilter] Failed to buffer error:', e);
        }
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
