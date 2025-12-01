export default function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const status = res.statusCode;
    // Keep log concise but informative
    console.log(`${method} ${url} ${status} - ${duration}ms`);
  });

  next();
}
