/**
 * Lightweight request logger.
 *
 * Hooks into the `finish` event of every response to print a single
 * line per request:  `METHOD /path STATUS - Xms`.  Runs before any
 * route handler so the timing covers the full request lifecycle.
 */
export default function requestLogger(req, res, next) {
  const start = Date.now();

  // The 'finish' event fires after the response has been sent to the
  // client, giving us accurate round-trip timing.
  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const status = res.statusCode;
    console.log(`${method} ${url} ${status} - ${duration}ms`);
  });

  next();
}
