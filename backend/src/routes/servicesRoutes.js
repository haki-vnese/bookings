import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService
} from '../controllers/servicesController.js';

const router = express.Router();

router.get('/', catchAsync(getAllServices));
router.get('/debug/throw', catchAsync(() => {
  // throw inside the wrapped handler so catchAsync forwards the error to next(err)
  throw new Error('This is a test error for debugging purposes.');
}));
router.get('/:id', catchAsync(getServiceById));
router.post('/', catchAsync(createService));
router.put('/:id', catchAsync(updateService));
router.delete('/:id', catchAsync(deleteService));

export default router;