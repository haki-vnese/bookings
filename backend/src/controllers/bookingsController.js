import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const isSuperuser = (req) => req.user?.role === 'superuser';
const isAdmin = (req) => req.user?.role === 'admin' || isSuperuser(req);
const isTechnician = (req) => req.user?.role === 'staff';
const isCustomer = (req) => req.user?.role === 'customer';

function requireAdminSalon(req) {
    if (req.user?.role === 'admin' && !req.user?.company_id && !req.user?.salon_id) {
        throw new ApiError(403, 'Admin account is missing scope', { expose: true });
    }
}

async function getTechnicianScope(technicianId) {
    const { data: staffRow, error: staffError } = await supabase
        .from('staff')
        .select('staff_id, user_id, salon_id, company_id')
        .eq('staff_id', technicianId)
        .maybeSingle();

    if (staffError) throw new ApiError(500, staffError.message);
    if (staffRow) {
        return {
            technician_id: staffRow.staff_id,
            user_id: staffRow.user_id,
            salon_id: staffRow.salon_id || null,
            company_id: staffRow.company_id || null,
        };
    }

    const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('id, salon_id, company_id')
        .eq('id', technicianId)
        .eq('role', 'staff')
        .maybeSingle();

    if (userError) throw new ApiError(500, userError.message);
    if (!userRow) throw new ApiError(400, 'Invalid technician_id', { expose: true });

    return {
        technician_id: userRow.id,
        user_id: userRow.id,
        salon_id: userRow.salon_id || null,
        company_id: userRow.company_id || null,
    };
}

async function getCustomerScope(customerId) {
    const { data, error } = await supabase
        .from('customers')
        .select('id, salon_id, company_id')
        .eq('id', customerId)
        .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(400, 'Invalid customer_id', { expose: true });
    return {
        salon_id: data.salon_id || null,
        company_id: data.company_id || null,
    };
}

async function ensureAdminCanAccessBooking(req, booking) {
    if (!isAdmin(req) || isSuperuser(req)) return;

    requireAdminSalon(req);

    await ensureAdminCanAccessBookingParticipants(req, booking.technician_id, booking.customer_id);
}

async function ensureAdminCanAccessBookingParticipants(req, technicianId, customerId) {
    if (!isAdmin(req) || isSuperuser(req)) return;

    requireAdminSalon(req);

    const [staffScope, customerScope] = await Promise.all([
        getTechnicianScope(technicianId),
        getCustomerScope(customerId),
    ]);

    if (req.user.company_id) {
        if (staffScope.company_id !== req.user.company_id || customerScope.company_id !== req.user.company_id) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }

    if (req.user.salon_id) {
        if (staffScope.salon_id !== req.user.salon_id || customerScope.salon_id !== req.user.salon_id) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
}

export const getAllBookings = async (req, res) => {
    let query = supabase.from('bookings').select('*');

    if (!isSuperuser(req)) {
        requireAdminSalon(req);
        let staffByUserQuery = supabase.from('users').select('id').eq('role', 'staff');
        let staffByTableQuery = supabase.from('staff').select('staff_id, user_id');

        if (req.user.company_id) {
            staffByUserQuery = staffByUserQuery.eq('company_id', req.user.company_id);
            staffByTableQuery = staffByTableQuery.eq('company_id', req.user.company_id);
        }
        if (req.user.salon_id) {
            staffByUserQuery = staffByUserQuery.eq('salon_id', req.user.salon_id);
            staffByTableQuery = staffByTableQuery.eq('salon_id', req.user.salon_id);
        }

        const [staffByUser, staffByTable] = await Promise.all([
            staffByUserQuery,
            staffByTableQuery,
        ]);

        if (staffByUser.error) throw new ApiError(500, staffByUser.error.message);
        if (staffByTable.error) throw new ApiError(500, staffByTable.error.message);

        const scopedIds = new Set();
        (staffByUser.data || []).forEach((row) => scopedIds.add(row.id));
        (staffByTable.data || []).forEach((row) => {
            scopedIds.add(row.staff_id);
            if (row.user_id) scopedIds.add(row.user_id);
        });

        if (scopedIds.size === 0) {
            return res.status(200).json([]);
        }
        query = query.in('technician_id', Array.from(scopedIds));
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
        const staffScope = await getTechnicianScope(technicianId);
        const companyAllowed = req.user.company_id ? staffScope.company_id === req.user.company_id : true;
        const salonAllowed = req.user.salon_id ? staffScope.salon_id === req.user.salon_id : true;
        const allowed = companyAllowed && salonAllowed;
        if (!allowed) {
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
        const customerScope = await getCustomerScope(customerId);
        const companyAllowed = req.user.company_id ? customerScope.company_id === req.user.company_id : true;
        const salonAllowed = req.user.salon_id ? customerScope.salon_id === req.user.salon_id : true;
        const allowed = companyAllowed && salonAllowed;
        if (!allowed) {
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
        await ensureAdminCanAccessBookingParticipants(req, booking.technician_id, booking.customer_id);
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
        const targetTechnicianId = updates.technician_id || existing.technician_id;
        const targetCustomerId = updates.customer_id || existing.customer_id;
        await ensureAdminCanAccessBookingParticipants(req, targetTechnicianId, targetCustomerId);
    } else {
        if (!isCustomer(req) || existing.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
        if (updates.customer_id && updates.customer_id !== req.user.userId) {
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

