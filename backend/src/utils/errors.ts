/**
 * Custom error types for WebTerm
 */

/** Base error class for WebTerm */
export class WebTermError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'WebTermError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): { code: string; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

/** Resource not found */
export class NotFoundError extends WebTermError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, `${resource.toUpperCase()}_NOT_FOUND`, 404);
    this.name = 'NotFoundError';
  }
}

/** Validation error */
export class ValidationError extends WebTermError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly constraint?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }

  override toJSON(): { code: string; message: string; details?: { field?: string; constraint?: string } } {
    const base = super.toJSON();
    if (this.field || this.constraint) {
      const details: { field?: string; constraint?: string } = {};
      if (this.field !== undefined) details.field = this.field;
      if (this.constraint !== undefined) details.constraint = this.constraint;
      return {
        ...base,
        details,
      };
    }
    return base;
  }
}

/** Duplicate resource */
export class DuplicateError extends WebTermError {
  constructor(resource: string, field: string, value: string) {
    super(`${resource} with ${field} '${value}' already exists`, 'DUPLICATE_NAME', 409);
    this.name = 'DuplicateError';
  }
}

/** Pane limit exceeded */
export class PaneLimitError extends WebTermError {
  constructor(limit: number) {
    super(`Maximum pane limit (${limit}) reached`, 'PANE_LIMIT_EXCEEDED', 400);
    this.name = 'PaneLimitError';
  }
}

/** PTY spawn error */
export class PtyError extends WebTermError {
  constructor(message: string) {
    super(message, 'PTY_ERROR', 500);
    this.name = 'PtyError';
  }
}

/** WebSocket error */
export class WebSocketError extends WebTermError {
  constructor(message: string) {
    super(message, 'WEBSOCKET_ERROR', 500);
    this.name = 'WebSocketError';
  }
}

/**
 * Check if an error is a WebTermError
 */
export function isWebTermError(error: unknown): error is WebTermError {
  return error instanceof WebTermError;
}

/**
 * Convert any error to a standard error response
 */
export function toErrorResponse(error: unknown): { error: { code: string; message: string } } {
  if (isWebTermError(error)) {
    return { error: error.toJSON() };
  }
  
  if (error instanceof Error) {
    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    };
  }
  
  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message: String(error),
    },
  };
}
