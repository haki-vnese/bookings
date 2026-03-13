import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import { verifyAuth, authorize } from '../middleware/auth.js';
import { getAllSalons } from '../controllers/salonsController.js';

const router = express.Router();

router.get('/', verifyAuth, authorize('admin', 'superuser'), catchAsync(getAllSalons));

export default router;
