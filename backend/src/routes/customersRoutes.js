import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import validate from '../middleware/validate.js';
import { verifyAuth, authorize } from '../middleware/auth.js';
import { customerSchemas } from '../validation/schemas.js';
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customersController.js';

const router = express.Router();

router.get('/', verifyAuth, authorize('admin', 'superuser'), catchAsync(getAllCustomers));
router.get('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(getCustomerById));
router.post('/', validate(customerSchemas.create), verifyAuth, authorize('admin', 'superuser'), catchAsync(createCustomer));
router.put('/:id', validate(customerSchemas.update), verifyAuth, authorize('admin', 'superuser'), catchAsync(updateCustomer));
router.delete('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(deleteCustomer));

export default router;
