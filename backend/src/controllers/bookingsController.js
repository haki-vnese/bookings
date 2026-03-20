/**
 * Bookings controller — CRUD with role-based authorization and tenant isolation.
 *
 * Access model:
 *   • Superuser   – unrestricted access to all bookings.
 *   • Admin       – can only see/modify bookings whose technician AND
 *                   customer both belong to the admin's company/salon.
 *   • Staff       – can view their own bookings only.
 *   • Customer    – can view/create/update their own bookings only.
 *
 * Technician IDs may be either a `users.id` or a `staff.staff_id` — the
 * helper `getTechnicianScope` normalises both shapes so scoping checks
 * work regardless of which ID was written at booking time.
 */
import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { isSuperuser, isAdminOrAbove, isStaff, isCustomer, ensureAdminScope } from '../utils/roles.js';

// ══════════════════════════════════════════════════════════════════════════
//  Internal scope helpers (booking-specific — not shared)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Looks up the salon/company scope for a technician ID.
 * Checks the `staff` table first, then falls back to `users` with role=staff.
 */
async function getTechnicianScope(technicianId) {
    // Support both data shapes found in production: bookings can reference
    // either staff.staff_id or users.id for a technician.
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

/** Fetches a customer's salon/company for tenant-scope comparisons. */
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

/**
 * Verifies that an admin's tenant scope covers the given booking.
 * Superusers skip this check entirely.
 */
async function ensureAdminCanAccessBooking(req, booking) {
    if (!isAdminOrAbove(req) || isSuperuser(req)) return;

    ensureAdminScope(req);

    // Booking access is derived from both participants: the technician and
    // the customer must both belong to the admin tenant scope.
    await ensureAdminCanAccessBookingParticipants(req, booking.technician_id, booking.customer_id);
}

/**
 * Cross-checks both booking participants (technician + customer)
 * against the admin's company/salon. Both must match.
 */
async function ensureAdminCanAccessBookingParticipants(req, technicianId, customerId) {
    if (!isAdminOrAbove(req) || isSuperuser(req)) return;

    ensureAdminScope(req);

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

// ══════════════════════════════════════════════════════════════════════════
//  CRUD handlers
// ══════════════════════════════════════════════════════════════════════════

/** GET /api/bookings — returns bookings visible to the authenticated user. */
export const getAllBookings = async (req, res) => {
    let query = supabase.from('bookings').select('*');

    if (!isSuperuser(req)) {
        ensureAdminScope(req);
        // Build an allowed technician ID set from both user and staff tables,
        // then constrain bookings by that union.
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

/** GET /api/bookings/:id — single booking with ownership / scope check. */
export const getBookingById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Booking not found', { expose: true });
    if (isAdminOrAbove(req)) {
        await ensureAdminCanAccessBooking(req, data);
    } else {
        if (isCustomer(req) && data.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
        if (isStaff(req) && data.technician_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
    res.status(200).json(data);
};  

/**
 * GET /api/bookings/technician/:technicianId
 *
 * Checks both `staff.staff_id` and `staff.user_id` so bookings created
 * under either ID type are returned.
 */
export const getBookingByTechnician = async (req, res) => {
    const { technicianId } = req.params;

    if (isAdminOrAbove(req) && !isSuperuser(req)) {
        ensureAdminScope(req);
        const staffScope = await getTechnicianScope(technicianId);
        const companyAllowed = req.user.company_id ? staffScope.company_id === req.user.company_id : true;
        const salonAllowed = req.user.salon_id ? staffScope.salon_id === req.user.salon_id : true;
        const allowed = companyAllowed && salonAllowed;
        if (!allowed) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }

    if (!isAdminOrAbove(req) && (!isStaff(req) || technicianId !== req.user.userId)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
    }

    // Read via all possible technician identifiers so staff users still see
    // bookings even if older rows were written using a different ID type.
    const technicianIds = new Set([technicianId]);
    const [staffById, staffByUser] = await Promise.all([
        supabase.from('staff').select('staff_id, user_id').eq('staff_id', technicianId).maybeSingle(),
        supabase.from('staff').select('staff_id, user_id').eq('user_id', technicianId).maybeSingle(),
    ]);

    if (staffById.error) throw new ApiError(500, staffById.error.message);
    if (staffByUser.error) throw new ApiError(500, staffByUser.error.message);

    if (staffById.data?.staff_id) technicianIds.add(staffById.data.staff_id);
    if (staffById.data?.user_id) technicianIds.add(staffById.data.user_id);
    if (staffByUser.data?.staff_id) technicianIds.add(staffByUser.data.staff_id);
    if (staffByUser.data?.user_id) technicianIds.add(staffByUser.data.user_id);

    let query = supabase.from('bookings').select('*');
    const allTechnicianIds = Array.from(technicianIds);
    if (allTechnicianIds.length === 1) {
        query = query.eq('technician_id', allTechnicianIds[0]);
    } else {
        query = query.in('technician_id', allTechnicianIds);
    }

    const { data, error } = await query;
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

/** GET /api/bookings/customer/:customerId — scoped to admin tenant or customer self. */
export const getBookingByCustomer = async (req, res) => {
    const { customerId } = req.params;

    if (isAdminOrAbove(req) && !isSuperuser(req)) {
        ensureAdminScope(req);
        const customerScope = await getCustomerScope(customerId);
        const companyAllowed = req.user.company_id ? customerScope.company_id === req.user.company_id : true;
        const salonAllowed = req.user.salon_id ? customerScope.salon_id === req.user.salon_id : true;
        const allowed = companyAllowed && salonAllowed;
        if (!allowed) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }

    if (!isAdminOrAbove(req) && (!isCustomer(req) || customerId !== req.user.userId)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
    }
    const { data, error } = await supabase.from('bookings').select('*').eq('customer_id', customerId);
    
    if (error) throw new ApiError(500, error.message);
    res.status(200).json(data);
}

/** POST /api/bookings — creates a booking after participant scope check. */
export const createBooking = async (req, res) => {
    const booking = req.body;
    if (isAdminOrAbove(req) && !isSuperuser(req)) {
        await ensureAdminCanAccessBookingParticipants(req, booking.technician_id, booking.customer_id);
    }

    if (!isAdminOrAbove(req)) {
        if (!isCustomer(req) || booking.customer_id !== req.user.userId) {
            throw new ApiError(403, 'Forbidden: insufficient permissions', { expose: true });
        }
    }
    const { data, error } = await supabase.from('bookings').insert([booking]).select();
    
    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data);
}

/**
 * PUT /api/bookings/:id — updates a booking.
 * Admin scope is validated for both the *existing* and *new* participants.
 */
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
    if (isAdminOrAbove(req)) {
        // Validate both original record ownership and any reassigned
        // participants in the same request.
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

/** DELETE /api/bookings/:id — removes booking after ownership check. */
export const deleteBooking = async (req, res) => {
    const { id } = req.params;
    const { data: existing, error: existingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (existingError) throw new ApiError(500, existingError.message);
    if (!existing) throw new ApiError(404, 'Booking not found', { expose: true });
    if (isAdminOrAbove(req)) {
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

