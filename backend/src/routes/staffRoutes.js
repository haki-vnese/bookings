/**
 * Staff routes.
 *
 * GET /me is staff-only (view own profile).
 * All other endpoints require admin/superuser.
 */
import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import validate from '../middleware/validate.js';
import { verifyAuth, authorize } from '../middleware/auth.js';
import { staffSchemas } from '../validation/schemas.js';
import {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  getMyStaffProfile,
} from '../controllers/staffController.js';

const router = express.Router();

router.get('/me', verifyAuth, authorize('staff'), catchAsync(getMyStaffProfile));
router.get('/', verifyAuth, authorize('admin', 'superuser'), catchAsync(getAllStaff));
router.get('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(getStaffById));
router.post('/', verifyAuth, authorize('admin', 'superuser'), validate(staffSchemas.create), catchAsync(createStaff));
router.put('/:id', verifyAuth, authorize('admin', 'superuser'), validate(staffSchemas.update), catchAsync(updateStaff));
router.delete('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(deleteStaff));

export default router;
