/**
 * Higher-order function that wraps an async route handler so rejected
 * promises are forwarded to Express's `next(err)` automatically.
 *
 * Without this wrapper every async controller would need its own
 * try/catch → next(err) boilerplate.
 *
 * Usage:
 *   router.get('/', catchAsync(myAsyncHandler));
 */
export default function catchAsync(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
