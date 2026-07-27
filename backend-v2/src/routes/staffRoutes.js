import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
  createStaff,
  deleteStaff,
  getAllStaff,
  getStaffById,
  updateStaff
} from '../controllers/staffController.js';

const router = express.Router();

router.get('/', catchAsync(getAllStaff));
router.get('/:id', catchAsync(getStaffById));
router.post('/', catchAsync(createStaff));
router.put('/:id', catchAsync(updateStaff));
router.delete('/:id', catchAsync(deleteStaff));

export default router;
