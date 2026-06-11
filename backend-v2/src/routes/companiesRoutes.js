import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany
} from '../controllers/companiesController.js';

const router = express.Router();

// Route CRUD cho Company. Controller xử lý tạo/update Address lồng bên trong,
// nên route vẫn tập trung vào resource Company.
router.get('/', catchAsync(getAllCompanies));
router.get('/:id', catchAsync(getCompanyById));
router.post('/', catchAsync(createCompany));
router.put('/:id', catchAsync(updateCompany));
router.delete('/:id', catchAsync(deleteCompany));

export default router;
