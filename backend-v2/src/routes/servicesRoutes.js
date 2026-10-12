import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
  createService,
  deleteService,
  getServiceById,
  getServices,
  updateService
} from '../controllers/servicesController.js';

const router = express.Router();

router.get('/', catchAsync(getServices));
router.get('/:id', catchAsync(getServiceById));
router.post('/', catchAsync(createService));
router.put('/:id', catchAsync(updateService));
router.delete('/:id', catchAsync(deleteService));

export default router;
