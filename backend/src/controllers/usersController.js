import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';
import bcrypt from 'bcryptjs';

const USER_SELECT_FIELDS = 'id, name, email, username, role, role_id, company_id, salon_id, created_at, updated_at, created_by, updated_by';

const isSuperuser = (req) => req.user?.role === 'superuser';
const isAdmin = (req) => req.user?.role === 'admin';

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
    res.status(201).json(data); 
}

export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, username, role, salon_id, company_id } = req.body;

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

