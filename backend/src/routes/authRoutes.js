import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import validate from '../middleware/validate.js';
import { verifyAuth } from '../middleware/auth.js';
import { authSchemas } from '../validation/schemas.js';
import {
  register,
  login,
  getCurrentUser,
  logout,
  verifyToken
} from '../controllers/authController.js';

const router = express.Router();

// Public routes
router.post('/register', validate(authSchemas.register), catchAsync(register));
router.post('/login', validate(authSchemas.login), catchAsync(login));
router.post('/verify', catchAsync(verifyToken));

// Protected routes
router.get('/me', verifyAuth, catchAsync(getCurrentUser));
router.post('/logout', verifyAuth, catchAsync(logout));

export default router;
