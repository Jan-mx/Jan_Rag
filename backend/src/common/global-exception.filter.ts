import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { BusinessError, ForbiddenError, UnauthorizedError } from './errors';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof BusinessError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof UnauthorizedError) {
      status = HttpStatus.UNAUTHORIZED;
      message = exception.message;
    } else if (exception instanceof ForbiddenError) {
      status = HttpStatus.FORBIDDEN;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      message = typeof payload === 'object' && payload !== null && 'message' in payload
        ? String(Array.isArray((payload as any).message) ? (payload as any).message[0] : (payload as any).message)
        : exception.message;
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error('[GlobalExceptionFilter]', exception);
    }

    response.status(status).json({ success: false, data: null, message });
  }
}

