import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser
} from '../controllers/usersController.js';

const router = express.Router();

router.get('/', catchAsync(getAllUsers));
router.get('/:id', catchAsync(getUserById));
router.post('/', catchAsync(createUser));
router.put('/:id', catchAsync(updateUser));
router.delete('/:id', catchAsync(deleteUser));

export default router;
