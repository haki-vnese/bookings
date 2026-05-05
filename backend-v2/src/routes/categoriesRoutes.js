// src/routes/categoriesRoutes.js

import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
    seedCategoriesIfEmpty
} from '../controllers/categoriesController.js';

const router = express.Router();

router.get('/', catchAsync(getAllCategories));
router.get('/:id', catchAsync(getCategoryById));
router.post('/', catchAsync(createCategory));
router.put('/:id', catchAsync(updateCategory));
router.delete('/:id', catchAsync(deleteCategory));
router.post('/seed', catchAsync(seedCategoriesIfEmpty));

export default router;  