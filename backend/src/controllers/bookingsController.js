import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const isSuperuser = (req) => req.user?.role === 'superuser';
const isAdmin = (req) => req.user?.role === 'admin' || isSuperuser(req);
const isTechnician = (req) => req.user?.role === 'staff';
const isCustomer = (req) => req.user?.role === 'customer';

function requireAdminSalon(req) {
    if (req.user?.role === 'admin' && !req.user?.salon_id) {
        throw new ApiError(403, 'Admin account is missing salon scope', { expose: true });
    }
}

async function getStaffSalonId(staffUserId) {
    const { data, error } = await supabase
        .from('users')
        .select('id, salon_id')
        .eq('id', staffUserId)
        .eq('role', 'staff')
        .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(400, 'Invalid technician_id', { expose: true });
    return data.salon_id;
}

async function getCustomerSalonId(customerId) {
    const { data, error } = await supabase
        .from('customers')
        .select('id, salon_id')
        .eq('id', customerId)
        .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(400, 'Invalid customer_id', { expose: true });
    return data.salon_id;
}

async function ensureAdminCanAccessBooking(req, booking) {
    if (!isAdmin(req) || isSuperuser(req)) return;

    requireAdminSalon(req);
    const adminSalonId = req.user.salon_id;

    const [staffSalonId, customerSalonId] = await Promise.all([
        getStaffSalonId(booking.technician_id),
        getCustomerSalonId(booking.customer_id),
    ]);

    if (staffSalonId !== adminSalonId || customerSalonId !== adminSalonId) {
        throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
    }
}

export const getAllBookings = async (req, res) => {
    let query = supabase.from('bookings').select('*');

    if (!isSuperuser(req)) {
        requireAdminSalon(req);
        const { data: salonStaff, error: staffError } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'staff')
            .eq('salon_id', req.user.salon_id);
        if (staffError) throw new ApiError(500, staffError.message);
        const staffIds = (salonStaff || []).map((row) => row.id);
        if (staffIds.length === 0) {
            return res.status(200).json([]);
        }
        query = query.in('technician_id', staffIds);
    }

    const { data, error } = await query;
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
};

export const getBookingById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Booking not found', { expose: true });
    if (isAdmin(req)) {
        await ensureAdminCanAccessBooking(req, data);
    } else {
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

    if (isAdmin(req) && !isSuperuser(req)) {
        requireAdminSalon(req);
        const staffSalonId = await getStaffSalonId(technicianId);
        if (staffSalonId !== req.user.salon_id) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }

    if (!isAdmin(req) && (!isTechnician(req) || technicianId !== req.user.userId)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
    }
    const { data, error } = await supabase.from('bookings').select('*').eq('technician_id', technicianId);
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

export const getBookingByCustomer = async (req, res) => {
    const { customerId } = req.params;

    if (isAdmin(req) && !isSuperuser(req)) {
        requireAdminSalon(req);
        const customerSalonId = await getCustomerSalonId(customerId);
        if (customerSalonId !== req.user.salon_id) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }

    if (!isAdmin(req) && (!isCustomer(req) || customerId !== req.user.userId)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
    }
    const { data, error } = await supabase.from('bookings').select('*').eq('customer_id', customerId);
    
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

export const createBooking = async (req, res) => {
    const booking = req.body;
    if (isAdmin(req) && !isSuperuser(req)) {
        requireAdminSalon(req);
        const [staffSalonId, customerSalonId] = await Promise.all([
            getStaffSalonId(booking.technician_id),
            getCustomerSalonId(booking.customer_id),
        ]);
        if (staffSalonId !== req.user.salon_id || customerSalonId !== req.user.salon_id) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }

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
    if (isAdmin(req)) {
        await ensureAdminCanAccessBooking(req, existing);
    } else {
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
    if (isAdmin(req)) {
        await ensureAdminCanAccessBooking(req, existing);
    } else {
        if (!isCustomer(req) || existing.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
    const { data, error } = await supabase.from('bookings').delete().eq('id', id).select();

    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Booking not found', { expose: true });
    res.status(200).json(data);
}

