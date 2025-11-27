import express from 'express';
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

router.get('/', getAllBookings);
router.get('/:id', getBookingById);
router.get('/technician/:technicianId', getBookingByTechnician);
router.get('/customer/:customerId', getBookingByCustomer);
router.post('/', createBooking);
router.put('/:id', updateBooking);
router.delete('/:id', deleteBooking);

export default router;