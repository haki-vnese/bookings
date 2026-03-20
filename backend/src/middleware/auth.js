/**
 * Authentication & authorisation middleware.
 *
 * Two middleware functions exported:
 *   • `verifyAuth`  — decodes & verifies the JWT from the Authorization
 *                     header, attaches the payload to `req.user`.
 *   • `authorize`   — factory that returns middleware rejecting requests
 *                     whose `req.user.role` is not in the allowed list.
 *
 * JWT payload shape (set during login):
 *   { userId, role, company_id?, salon_id? }
 */
import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';

/**
 * Verify JWT token and attach user to request
 * Used as middleware to protect routes
 */
export const verifyAuth = (req, res, next) => {
    try {
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            throw new ApiError(500, 'Server auth configuration is missing');
        }
        
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];

        if (!token) {
            throw new ApiError(401, 'No token provided', { expose: true });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err instanceof ApiError) {
            return next(err);
        }
        next(new ApiError(401, 'Invalid or expired token', { expose: true }));
    }
}

/**
 * Check if user has specific role
 * Usage: router.get('/admin', authorize('admin'), controller)
 */
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new ApiError(401, 'Unauthorized', { expose: true }));
        }

        if (!roles.includes(req.user.role)) {
            return next(new ApiError(403, 'Forbidden: insufficient permissions', { expose: true }));
        }

        next();
    }
}
