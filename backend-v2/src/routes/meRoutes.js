import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import { getMe } from '../controllers/meController.js';

const router = express.Router();

router.get('/', catchAsync(getMe));

export default router;
