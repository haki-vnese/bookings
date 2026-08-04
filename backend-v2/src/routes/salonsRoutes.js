import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import {    
    getSalonsByCompanyId,
    getSalonById,
    createSalon,
    updateSalon,
    deleteSalon
} from '../controllers/salonsController.js';

const router = express.Router();   

router.get('/company/:companyId/salons', catchAsync(getSalonsByCompanyId));
router.post('/company/:companyId/salons', catchAsync(createSalon));
router.get('/salons/:id', catchAsync(getSalonById));
router.put('/salons/:id', catchAsync(updateSalon));
router.delete('/salons/:id', catchAsync(deleteSalon));

export default router;
