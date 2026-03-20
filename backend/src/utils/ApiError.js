/**
 * Custom error class for operational (expected) HTTP errors.
 *
 * Throw an `ApiError` from any controller or middleware — the
 * centralised `errorHandler` in middleware/errorHandler.js will pick up
 * `status` and decide whether to expose the message based on the
 * `expose` flag.
 *
 * Usage:
 *   throw new ApiError(404, 'Booking not found', { expose: true });
 *
 * @property {number} status  — HTTP status code (default 500)
 * @property {boolean} expose — when true, message is sent to the client
 */
export default class ApiError extends Error {
  constructor(status = 500, message = 'Error', { expose = false } = {}) {
    super(message);
    this.status = status;
    this.expose = expose;
    // Removes this constructor from the stack trace for cleaner output.
    Error.captureStackTrace?.(this, this.constructor);
  }
}
