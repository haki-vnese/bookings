import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';
import bcrypt from 'bcryptjs';

const USER_SELECT_FIELDS = 'id, name, email, username, role, role_id, company_id, salon_id, created_at, updated_at, created_by, updated_by';

const isSuperuser = (req) => req.user?.role === 'superuser';
const isAdmin = (req) => req.user?.role === 'admin';

async function resolveCompanyIdFromSalon(salonId) {
    if (!salonId) return null;

    const { data, error } = await supabase
        .from('salons')
        .select('company_id')
        .eq('id', salonId)
        .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(400, 'Invalid salon_id', { expose: true });
    return data.company_id || null;
}

async function syncStaffProfileForUser(user, actorId) {
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

    const { data: existing, error: existingError } = await supabase
        .from('staff')
        .select('staff_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (existingError) throw new ApiError(500, existingError.message);

    const payload = {
        user_id: user.id,
        name: user.name,
        email: user.email || null,
        company_id: derivedCompanyId,
        salon_id: user.salon_id,
        updated_by: actorId || null,
    };

    if (existing?.staff_id) {
        const { error: updateError } = await supabase
            .from('staff')
            .update(payload)
            .eq('staff_id', existing.staff_id);
        if (updateError) throw new ApiError(500, updateError.message);
        return;
    }

    const { error: insertError } = await supabase
        .from('staff')
        .insert([{ ...payload, created_by: actorId || null }]);
    if (insertError) throw new ApiError(500, insertError.message);
}

async function removeStaffProfileForUser(userId) {
    if (!userId) return;
    const { error } = await supabase.from('staff').delete().eq('user_id', userId);
    if (error) throw new ApiError(500, error.message);
}

function ensureAdminCompany(req) {
    if (isAdmin(req) && !req.user?.company_id && !req.user?.salon_id) {
        throw new ApiError(403, 'Admin account is missing scope', { expose: true });
    }
}

function applyUserVisibilityScope(query, req) {
    // Superusers can see all users. Admins are restricted to their own company.
    if (isSuperuser(req)) return query;
    if (isAdmin(req)) {
        ensureAdminCompany(req);
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
    res.json(data);
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
        res.json(data);
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
        ensureAdminCompany(req);
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
    res.json(data);
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

