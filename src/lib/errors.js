/* Centralized application errors — normalized by the API layer into the
   { success:false, error:{code,message}, requestId } envelope. */

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const ValidationError = (message, field) =>
  new AppError(422, "INVALID_INPUT", field ? `${field}: ${message}` : message);

export const AuthenticationError = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);

export const AuthorizationError = (message = "You are not allowed to perform this action") =>
  new AppError(403, "FORBIDDEN", message);

export const NotFoundError = (message = "Resource not found") => new AppError(404, "NOT_FOUND", message);

export const ConflictError = (message) => new AppError(409, "CONFLICT", message);

export const RateLimitError = (message = "Too many requests — slow down a moment") =>
  new AppError(429, "RATE_LIMITED", message);

export class ApiError extends Error {
  constructor(status, code, message, requestId) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}
