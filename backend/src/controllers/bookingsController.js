import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

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
    res.status(200).json(data);
};  

export const getBookingByTechnician = async (req, res) => {
    const { technicianId } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('technician_id', technicianId);
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

export const getBookingByCustomer = async (req, res) => {
    const { customerId } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('customer_id', customerId);
    
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

export const createBooking = async (req, res) => {
    const booking = req.body;
    const { data, error } = await supabase.from('bookings').insert([booking]).select();
    
    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data);
}

export const updateBooking = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const { data, error } = await supabase.from('bookings').update(updates).eq('id', id).select();

    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Booking not found', { expose: true });
    res.status(200).json(data);
}

export const deleteBooking = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').delete().eq('id', id).select();

    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Booking not found', { expose: true });
    res.status(200).json(data);
}

