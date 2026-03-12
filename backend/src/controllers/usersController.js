import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';

const USER_SELECT_FIELDS = 'id, name, email, role, salon_id, created_at, updated_at, created_by, updated_by';

const isSuperuser = (req) => req.user?.role === 'superuser';
const isAdmin = (req) => req.user?.role === 'admin';

function applyUserVisibilityScope(query, req) {
    // Superusers can see all users. Admins are restricted to their own salon.
    if (isSuperuser(req)) return query;
    if (isAdmin(req) && req.user?.salon_id) {
        return query.eq('salon_id', req.user.salon_id);
    }
    return query;
}

function isMissingColumnError(error, columnName) {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    const code = String(error.code || '').toUpperCase();
    return code === 'PGRST204' && message.includes(`'${String(columnName).toLowerCase()}' column`);
}

export const getAllUsers = async (req, res) => {
    let query = supabase.from('users').select(USER_SELECT_FIELDS).neq('role', 'customer');
    query = applyUserVisibilityScope(query, req);

    let { data, error } = await query;

    if (
        error &&
        (isMissingColumnError(error, 'salon_id') ||
            isMissingColumnError(error, 'updated_at') ||
            isMissingColumnError(error, 'created_by') ||
            isMissingColumnError(error, 'updated_by'))
    ) {
        let legacyQuery = supabase.from('users').select('id, name, email, role, created_at').neq('role', 'customer');
        legacyQuery = applyUserVisibilityScope(legacyQuery, req);
        const legacyRes = await legacyQuery;
        data = legacyRes.data;
        error = legacyRes.error;
    }

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

        let { data, error } = await query;

        if (
            error &&
            (isMissingColumnError(error, 'salon_id') ||
                isMissingColumnError(error, 'updated_at') ||
                isMissingColumnError(error, 'created_by') ||
                isMissingColumnError(error, 'updated_by'))
        ) {
            let legacyQuery = supabase
                .from('users')
                .select('id, name, email, role, created_at')
                .eq('id', id)
                .neq('role', 'customer')
                .maybeSingle();
            legacyQuery = applyUserVisibilityScope(legacyQuery, req);
            const legacyRes = await legacyQuery;
            data = legacyRes.data;
            error = legacyRes.error;
        }

        if (error) throw new ApiError(500, error.message);
        if (!data) throw new ApiError(404, 'User not found', { expose: true });
        res.json(data);
}

export const createUser = async (req, res) => {
    const { name, email, role, salon_id } = req.body;

    if (role === 'customer') {
        throw new ApiError(400, 'Customers must be created via customer endpoints', { expose: true });
    }

    if (isAdmin(req) && role === 'superuser') {
        throw new ApiError(403, 'Admins cannot create superusers', { expose: true });
    }

    const payload = {
        name,
        email,
        role,
        created_by: req.user?.userId,
        updated_by: req.user?.userId,
    };

    if (isSuperuser(req)) {
        payload.salon_id = salon_id || null;
    } else if (isAdmin(req)) {
        payload.salon_id = req.user?.salon_id || null;
    }

    let insertQuery = supabase.from('users').insert([payload]).select(USER_SELECT_FIELDS);
    let { data, error } = await insertQuery;

    if (
        error &&
        (isMissingColumnError(error, 'salon_id') ||
            isMissingColumnError(error, 'created_by') ||
            isMissingColumnError(error, 'updated_by'))
    ) {
        const legacyPayload = { name, email, role };
        const legacyRes = await supabase.from('users').insert([legacyPayload]).select('id, name, email, role, created_at');
        data = legacyRes.data;
        error = legacyRes.error;
    }

    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data); 
}

export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, role, salon_id } = req.body;

    const updates = {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(role !== undefined ? { role } : {}),
        updated_by: req.user?.userId,
    };

    if (isSuperuser(req) && salon_id !== undefined) {
        updates.salon_id = salon_id;
    }

    if (isAdmin(req) && role === 'superuser') {
        throw new ApiError(403, 'Admins cannot promote users to superuser', { expose: true });
    }

    let query = supabase.from('users').update(updates).eq('id', id).neq('role', 'customer');
    query = applyUserVisibilityScope(query, req);

    let { data, error } = await query.select(USER_SELECT_FIELDS);
    if (
        error &&
        (isMissingColumnError(error, 'updated_by') || isMissingColumnError(error, 'salon_id'))
    ) {
        const legacyUpdates = {
            ...(name !== undefined ? { name } : {}),
            ...(email !== undefined ? { email } : {}),
            ...(role !== undefined ? { role } : {}),
        };
        let legacyQuery = supabase.from('users').update(legacyUpdates).eq('id', id).neq('role', 'customer');
        legacyQuery = applyUserVisibilityScope(legacyQuery, req);
        const legacyRes = await legacyQuery.select('id, name, email, role, created_at');
        data = legacyRes.data;
        error = legacyRes.error;
    }

    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'User not found', { expose: true });
    res.json(data);
}

export const deleteUser = async (req, res) => {
    const { id } = req.params;

    let query = supabase.from('users').delete().eq('id', id).neq('role', 'customer');
    query = applyUserVisibilityScope(query, req);

    const { data, error } = await query.select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'User not found', { expose: true });
    res.status(204).send();
}       

export const getStaff = async (req, res) => {
    let query = supabase.from('users').select(USER_SELECT_FIELDS).eq('role', 'staff');
    query = applyUserVisibilityScope(query, req);

    let { data, error } = await query;

    if (
        error &&
        (isMissingColumnError(error, 'salon_id') ||
            isMissingColumnError(error, 'updated_at') ||
            isMissingColumnError(error, 'created_by') ||
            isMissingColumnError(error, 'updated_by'))
    ) {
        let legacyQuery = supabase
            .from('users')
            .select('id, name, email, role, created_at')
            .eq('role', 'staff');
        legacyQuery = applyUserVisibilityScope(legacyQuery, req);
        const legacyRes = await legacyQuery;
        data = legacyRes.data;
        error = legacyRes.error;
    }

    if (error) throw new ApiError(500, error.message);
    res.json(data);
}       

