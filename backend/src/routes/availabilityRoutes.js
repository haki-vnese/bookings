import express from 'express';
import { getAvailability } from '../controllers/availabilityController.js';
import catchAsync from '../utils/catchAsync.js';

const router = express.Router();
router.get('/:technicianId', catchAsync(getAvailability));

export default router;

