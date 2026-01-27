import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import validate from '../middleware/validate.js';
import { verifyAuth } from '../middleware/auth.js';
import { serviceSchemas } from '../validation/schemas.js';
import {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService
} from '../controllers/servicesController.js';

const router = express.Router();

router.get('/', catchAsync(getAllServices));
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug/throw', catchAsync(() => {
    // throw inside the wrapped handler so catchAsync forwards the error to next(err)
    throw new Error('This is a test error for debugging purposes.');
  }));
  // dev-only route showing an exposed ApiError (useful for tests)
  router.get('/debug/expose', (req, res, next) => {
    // ApiError will be handled by centralized error handler and the message will be exposed
    // This route is intentionally synchronous and simple for tests.
    next(new ApiError(400, 'exposed message', { expose: true }));
  });
}
router.get('/:id', catchAsync(getServiceById));
router.post('/', validate(serviceSchemas.create), verifyAuth, catchAsync(createService));
router.put('/:id', validate(serviceSchemas.update), verifyAuth, catchAsync(updateService));
router.delete('/:id', verifyAuth, catchAsync(deleteService));

export default router;
