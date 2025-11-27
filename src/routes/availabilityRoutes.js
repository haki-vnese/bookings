import express from 'express';
import { getAvailability } from '../controllers/availabilityController.js';

const router = express.Router();
router.get('/:technicianId', getAvailability);

export default router;

