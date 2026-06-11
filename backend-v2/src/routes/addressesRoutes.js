import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
  getAllAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress
} from '../controllers/addressesController.js';

const router = express.Router();

// CRUD Address hiện giữ đơn giản và chưa có auth trong backend-v2, cùng phong
// cách với API Category nhẹ hiện tại.
router.get('/', catchAsync(getAllAddresses));
router.get('/:id', catchAsync(getAddressById));
router.post('/', catchAsync(createAddress));
router.put('/:id', catchAsync(updateAddress));
router.delete('/:id', catchAsync(deleteAddress));

export default router;
