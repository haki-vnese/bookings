export function notFound(req, res, next) {
  res.status(404).json({ error: 'Not Found' });
}

export function errorHandler(err, req, res, next) {
  // Log the full error on the server for diagnostics
  console.error(err && err.stack ? err.stack : err);

  // Respect explicit status if provided by app code
  const status = err && err.status ? err.status : 500;

  // Don't leak internal error details to clients in production
  const isExpose = err && err.expose;
  const message = isExpose ? err.message : (status === 500 ? 'Internal Server Error' : err.message || 'Error');

  res.status(status).json({ error: message });
}