/**
 * Centralised error-handling middleware.
 *
 * `notFound`     — catch-all 404 mounted after all routes.
 * `errorHandler` — Express error middleware (4-arity signature).
 *
 * Error visibility rules:
 *   • `err.expose === true`  → send `err.message` to the client.
 *   • `err.status === 500`   → always send generic "Internal Server Error".
 *   • All other cases        → send `err.message` (4xx from framework, etc.).
 *
 * Every error is logged server-side with its full stack trace regardless
 * of what the client sees.
 */
export function notFound(req, res, next) {
  res.status(404).json({ error: 'Not Found' });
}

export function errorHandler(err, req, res, next) {
  console.error(err && err.stack ? err.stack : err);

  const status = err && err.status ? err.status : 500;

  // Only expose error messages that were explicitly marked safe (ApiError
  // with `expose: true`).  500s always get a generic message to avoid
  // leaking implementation details.
  const isExpose = err && err.expose;
  const message = isExpose ? err.message : (status === 500 ? 'Internal Server Error' : err.message || 'Error');

  res.status(status).json({ error: message });
}