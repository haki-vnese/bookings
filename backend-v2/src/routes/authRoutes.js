import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
  login,
  logout,
  refresh,
  requestPasswordReset,
  resetPassword
} from '../controllers/authController.js';

const router = express.Router();

router.post('/login', catchAsync(login));
router.post('/request-password-reset', catchAsync(requestPasswordReset));
router.post('/refresh', catchAsync(refresh));
router.post('/logout', catchAsync(logout));
router.post('/reset-password', catchAsync(resetPassword));

export default router;
