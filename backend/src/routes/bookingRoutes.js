import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import validate from '../middleware/validate.js';
import { bookingSchemas } from '../validation/schemas.js';
import {
    getAllBookings,
    getBookingById,
    getBookingByTechnician,
    getBookingByCustomer,
    createBooking,    
    updateBooking,  
    deleteBooking
} from '../controllers/bookingsController.js';

const router = express.Router();

router.get('/', catchAsync(getAllBookings));
// more specific routes must come before the param route '/:id'
router.get('/technician/:technicianId', catchAsync(getBookingByTechnician));
router.get('/customer/:customerId', catchAsync(getBookingByCustomer));
router.get('/:id', catchAsync(getBookingById));
router.post('/', validate(bookingSchemas.create), catchAsync(createBooking));
router.put('/:id', validate(bookingSchemas.update), catchAsync(updateBooking));
router.delete('/:id', catchAsync(deleteBooking));

export default router;