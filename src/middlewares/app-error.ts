export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static validationError(message: string, details?: unknown): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static internal(message = 'Internal Server Error'): AppError {
    return new AppError(500, 'INTERNAL_SERVER_ERROR', message);
  }
}
