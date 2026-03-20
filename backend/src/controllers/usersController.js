/**
 * Users controller — CRUD for admin/staff/superuser accounts.
 *
 * Key behaviours:
 *   • Excludes customers from all queries (customers have their own endpoints).
 *   • Admin-created users are automatically pinned to the admin's tenant scope.
 *   • When a user's role is "staff", a matching row in the `staff` table is
 *     created/updated via atomic upsert (requires UNIQUE on staff.user_id).
 *   • Visibility is tenant-scoped: admins see users within their company (or
 *     salon), superusers see all.
 */
import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';
import bcrypt from 'bcryptjs';
import { isSuperuser, isAdmin, ensureAdminScope } from '../utils/roles.js';
import { resolveCompanyIdFromSalon } from '../utils/tenantScope.js';
import { withSalonName } from '../utils/enrichment.js';

// Consistent projection for all user queries — never exposes the password column.
const USER_SELECT_FIELDS = 'id, name, email, username, role, role_id, company_id, salon_id, created_at, updated_at, created_by, updated_by';

async function syncStaffProfileForUser(user, actorId) {
    // Staff users are mirrored into the staff table so scheduling and
    // technician-facing queries can rely on a dedicated staff entity.
    if (String(user?.role || '').toLowerCase() !== 'staff') {
        return;
    }

    if (!user?.salon_id) {
        throw new ApiError(400, 'Staff user requires salon_id', { expose: true });
    }

    const derivedCompanyId = user.company_id || (await resolveCompanyIdFromSalon(user.salon_id));
    if (!derivedCompanyId) {
        throw new ApiError(400, 'Staff user requires company scope', { expose: true });
    }

    // Atomic upsert eliminates the read-then-write race condition that
    // occurred when two concurrent requests both tried to create the same
    // staff profile.  Requires a UNIQUE constraint on staff.user_id.
    const payload = {
        user_id: user.id,
        name: user.name,
        email: user.email || null,
        company_id: derivedCompanyId,
        salon_id: user.salon_id,
        created_by: actorId || null,
        updated_by: actorId || null,
    };

    const { error: upsertError } = await supabase
        .from('staff')
        .upsert(payload, { onConflict: 'user_id' });

    if (upsertError) throw new ApiError(500, upsertError.message);
}

async function removeStaffProfileForUser(userId) {
    if (!userId) return;
    const { error } = await supabase.from('staff').delete().eq('user_id', userId);
    if (error) throw new ApiError(500, error.message);
}

function applyUserVisibilityScope(query, req) {
    // Superusers can see all users. Admins are tenant-scoped.
    // When company scope is present, it takes precedence; otherwise we fall
    // back to salon-level scope.
    if (isSuperuser(req)) return query;
    if (isAdmin(req)) {
        ensureAdminScope(req);
        if (req.user?.company_id) return query.eq('company_id', req.user.company_id);
        return query.eq('salon_id', req.user.salon_id);
    }
    return query;
}

export const getAllUsers = async (req, res) => {
    let query = supabase.from('users').select(USER_SELECT_FIELDS).neq('role', 'customer');
    query = applyUserVisibilityScope(query, req);

    const { data, error } = await query;

    if (error) throw new ApiError(500, error.message);
    res.json(await withSalonName(data || []));
}   

export const getUserById = async (req, res) => {
        const { id } = req.params;
        let query = supabase
            .from('users')
            .select(USER_SELECT_FIELDS)
            .eq('id', id)
            .neq('role', 'customer')
            .maybeSingle();
        query = applyUserVisibilityScope(query, req);

        const { data, error } = await query;

        if (error) throw new ApiError(500, error.message);
        if (!data) throw new ApiError(404, 'User not found', { expose: true });
        const rows = await withSalonName([data]);
        res.json(rows[0]);
}

export const createUser = async (req, res) => {
    const { name, email, username, password, role, salon_id, company_id } = req.body;

    if (role === 'customer') {
        throw new ApiError(400, 'Customers must be created via customer endpoints', { expose: true });
    }

    if (isAdmin(req) && role === 'superuser') {
        throw new ApiError(403, 'Admins cannot create superusers', { expose: true });
    }

    if (String(role || '').toLowerCase() === 'staff' && !salon_id && !(isAdmin(req) && req.user?.salon_id)) {
        throw new ApiError(400, 'salon_id is required for staff users', { expose: true });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const payload = {
        name,
        email,
        username: username || null,
        password: hashedPassword,
        role,
        created_by: req.user?.userId,
        updated_by: req.user?.userId,
    };

    if (isSuperuser(req)) {
        payload.company_id = company_id || null;
        payload.salon_id = salon_id || null;
    } else if (isAdmin(req)) {
        // Admin-created users are always pinned to admin tenant scope.
        ensureAdminScope(req);
        payload.company_id = req.user?.company_id || null;
        payload.salon_id = req.user?.salon_id || null;
    }

    let insertQuery = supabase.from('users').insert([payload]).select(USER_SELECT_FIELDS);
    const { data, error } = await insertQuery;

    if (error) throw new ApiError(500, error.message);
    if (data?.[0]) {
        await syncStaffProfileForUser(data[0], req.user?.userId);
    }
    res.status(201).json(data); 
}

export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, username, role, salon_id, company_id } = req.body;

    let existingQuery = supabase
        .from('users')
        .select('id, role, salon_id')
        .eq('id', id)
        .neq('role', 'customer')
        .maybeSingle();
    existingQuery = applyUserVisibilityScope(existingQuery, req);
    const { data: existingUser, error: existingError } = await existingQuery;

    if (existingError) throw new ApiError(500, existingError.message);
    if (!existingUser) throw new ApiError(404, 'User not found', { expose: true });

    const effectiveRole = String(role !== undefined ? role : existingUser.role || '').toLowerCase();
    const effectiveSalonId = salon_id !== undefined ? salon_id : existingUser.salon_id;
    if (effectiveRole === 'staff' && !effectiveSalonId) {
        throw new ApiError(400, 'salon_id is required for staff users', { expose: true });
    }

    const updates = {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(username !== undefined ? { username } : {}),
        ...(role !== undefined ? { role } : {}),
        updated_by: req.user?.userId,
    };

    if (isSuperuser(req) && salon_id !== undefined) {
        updates.salon_id = salon_id;
    }
    if (isSuperuser(req) && company_id !== undefined) {
        updates.company_id = company_id;
    }

    if (isAdmin(req) && role === 'superuser') {
        throw new ApiError(403, 'Admins cannot promote users to superuser', { expose: true });
    }
    if (isAdmin(req) && req.user?.company_id && company_id !== undefined && company_id !== req.user?.company_id) {
        throw new ApiError(403, 'Admins cannot move users across companies', { expose: true });
    }

    let query = supabase.from('users').update(updates).eq('id', id).neq('role', 'customer');
    query = applyUserVisibilityScope(query, req);

    const { data, error } = await query.select(USER_SELECT_FIELDS);

    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'User not found', { expose: true });

    const updatedUser = data[0];
    // Keep users and staff tables synchronized when role changes.
    if (String(updatedUser?.role || '').toLowerCase() === 'staff') {
        await syncStaffProfileForUser(updatedUser, req.user?.userId);
    } else {
        await removeStaffProfileForUser(updatedUser?.id);
    }

    res.json(data);
}

export const deleteUser = async (req, res) => {
    const { id } = req.params;

    let query = supabase.from('users').delete().eq('id', id).neq('role', 'customer');
    query = applyUserVisibilityScope(query, req);

    const { data, error } = await query.select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'User not found', { expose: true });

    await Promise.all((data || []).map((row) => removeStaffProfileForUser(row.id)));
    res.status(204).send();
}       

export const getStaff = async (req, res) => {
    let query = supabase.from('users').select(USER_SELECT_FIELDS).eq('role', 'staff');
    query = applyUserVisibilityScope(query, req);

    const { data, error } = await query;

    if (error) throw new ApiError(500, error.message);
    res.json(await withSalonName(data || []));
}       

export const updateCurrentUser = async (req, res) => {
    const { name, email, username } = req.body;
    const userId = req.user?.userId;

    const updates = {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(username !== undefined ? { username } : {}),
        updated_by: userId,
    };

    let { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select(USER_SELECT_FIELDS)
        .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'User not found', { expose: true });
    res.json(data);
};

