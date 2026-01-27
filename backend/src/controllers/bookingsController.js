import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const isAdmin = (req) => req.user?.role === 'admin';
const isTechnician = (req) => req.user?.role === 'technician';
const isCustomer = (req) => req.user?.role === 'customer';

export const getAllBookings = async (req, res) => {
    const { data, error } = await supabase.from('bookings').select('*');
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
};

export const getBookingById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Booking not found', { expose: true });
    if (!isAdmin(req)) {
        if (isCustomer(req) && data.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
        if (isTechnician(req) && data.technician_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
    res.status(200).json(data);
};  

export const getBookingByTechnician = async (req, res) => {
    const { technicianId } = req.params;
    if (!isAdmin(req) && (!isTechnician(req) || technicianId !== req.user.userId)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
    }
    const { data, error } = await supabase.from('bookings').select('*').eq('technician_id', technicianId);
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

export const getBookingByCustomer = async (req, res) => {
    const { customerId } = req.params;
    if (!isAdmin(req) && (!isCustomer(req) || customerId !== req.user.userId)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
    }
    const { data, error } = await supabase.from('bookings').select('*').eq('customer_id', customerId);
    
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

export const createBooking = async (req, res) => {
    const booking = req.body;
    if (!isAdmin(req)) {
        if (!isCustomer(req) || booking.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
    const { data, error } = await supabase.from('bookings').insert([booking]).select();
    
    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data);
}

export const updateBooking = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const { data: existing, error: existingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (existingError) throw new ApiError(500, existingError.message);
    if (!existing) throw new ApiError(404, 'Booking not found', { expose: true });
    if (!isAdmin(req)) {
        if (!isCustomer(req) || existing.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
    const { data, error } = await supabase.from('bookings').update(updates).eq('id', id).select();

    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Booking not found', { expose: true });
    res.status(200).json(data);
}

export const deleteBooking = async (req, res) => {
    const { id } = req.params;
    const { data: existing, error: existingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (existingError) throw new ApiError(500, existingError.message);
    if (!existing) throw new ApiError(404, 'Booking not found', { expose: true });
    if (!isAdmin(req)) {
        if (!isCustomer(req) || existing.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
    const { data, error } = await supabase.from('bookings').delete().eq('id', id).select();

    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Booking not found', { expose: true });
    res.status(200).json(data);
}

