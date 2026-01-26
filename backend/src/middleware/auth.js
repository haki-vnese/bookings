import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';

/**
 * Verify JWT token and attach user to request
 * Used as middleware to protect routes
 */
export const verifyAuth = (req, res, next) => {
    try {
        const JWT_SECRET = process.env.JWT_SECRET;
        
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
