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

// Authentication entry points. catchAsync forwards rejected promises to the
// shared Express error handler so controllers can use async/await directly.
router.post('/login', catchAsync(login));
// The reset request always returns a generic response so callers cannot use
// this endpoint to discover whether an email address has an account.
router.post('/request-password-reset', catchAsync(requestPasswordReset));
router.post('/refresh', catchAsync(refresh));
router.post('/logout', catchAsync(logout));
// The client submits the one-time token from the emailed URL together with the
// new password; successful completion activates the account and consumes it.
router.post('/reset-password', catchAsync(resetPassword));

export default router;
