/**
 * Customer routes — admin/superuser CRUD for customer records.
 */
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
router.post('/', verifyAuth, authorize('admin', 'superuser'), validate(customerSchemas.create), catchAsync(createCustomer));
router.put('/:id', verifyAuth, authorize('admin', 'superuser'), validate(customerSchemas.update), catchAsync(updateCustomer));
router.delete('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(deleteCustomer));

export default router;
