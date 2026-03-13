import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import validate from '../middleware/validate.js';
import { verifyAuth, authorize } from '../middleware/auth.js';
import { companySchemas } from '../validation/schemas.js';
import {
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
} from '../controllers/companiesController.js';

const router = express.Router();

router.get('/', verifyAuth, authorize('admin', 'superuser'), catchAsync(getAllCompanies));
router.get('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(getCompanyById));
router.post('/', validate(companySchemas.create), verifyAuth, authorize('superuser'), catchAsync(createCompany));
router.put('/:id', validate(companySchemas.update), verifyAuth, authorize('superuser'), catchAsync(updateCompany));
router.delete('/:id', verifyAuth, authorize('superuser'), catchAsync(deleteCompany));

export default router;
