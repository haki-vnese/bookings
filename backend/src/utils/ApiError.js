export default class ApiError extends Error {
  constructor(status = 500, message = 'Error', { expose = false } = {}) {
    super(message);
    this.status = status;
    this.expose = expose;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
