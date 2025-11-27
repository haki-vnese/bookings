import { supabase } from '../db/supabase.js';

export const getAllBookings = async (req, res) => {
    const { data, error } = await supabase.from('bookings').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
};

export const getBookingById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (error) 
        return res.status(500).json({ error: error.message });
    res.status(200).json(data);
};  

export const getBookingByTechnician = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('technician_id', id);
    if (error) 
        return res.status(500).json({ error: error.message });
    res.status(200).json(data);
}

export const getBookingByCustomer = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('customer_id', id);
    
    if (error) 
        return res.status(500).json({ error: error.message });
    res.status(200).json(data);
}

export const createBooking = async (req, res) => {
    const booking = req.body;
    const { data, error } = await supabase.from('bookings').insert([booking]);
    
    if (error) 
        return res.status(500).json({ error: error.message });
    res.status(201).json(data);
}

export const updateBooking = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const { data, error } = await supabase.from('bookings').update(updates).eq('id', id);

    if (error) 
        return res.status(500).json({ error: error.message });
    res.status(200).json(data);
}

export const deleteBooking = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').delete().eq('id', id);

    if (error) 
        return res.status(500).json({ error: error.message });
    res.status(200).json(data);
}

