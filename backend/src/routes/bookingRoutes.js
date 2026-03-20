/**
 * Booking routes.
 *
 * All routes require authentication.  GET / is restricted to admin/superuser;
 * technician and customer sub-routes enforce ownership in the controller.
 */
import express from 'express';
import catchAsync from '../utils/catchAsync.js';
import validate from '../middleware/validate.js';
import { verifyAuth, authorize } from '../middleware/auth.js';
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

router.get('/', verifyAuth, authorize('admin', 'superuser'), catchAsync(getAllBookings));
// more specific routes must come before the param route '/:id'
router.get('/technician/:technicianId', verifyAuth, catchAsync(getBookingByTechnician));
router.get('/customer/:customerId', verifyAuth, catchAsync(getBookingByCustomer));
router.get('/:id', verifyAuth, catchAsync(getBookingById));
router.post('/', verifyAuth, validate(bookingSchemas.create), catchAsync(createBooking));
router.put('/:id', verifyAuth, validate(bookingSchemas.update), catchAsync(updateBooking));
router.delete('/:id', verifyAuth, catchAsync(deleteBooking));

export default router;
