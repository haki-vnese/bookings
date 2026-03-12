import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const CUSTOMER_SELECT_FIELDS = 'id, name, email, salon_id, created_at, updated_at, created_by, updated_by';

const isSuperuser = (req) => req.user?.role === 'superuser';
const isAdmin = (req) => req.user?.role === 'admin';

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toUpperCase();
  return code === 'PGRST204' && message.includes(`'${String(columnName).toLowerCase()}' column`);
}

function ensureAdminSalon(req) {
  if (isAdmin(req) && !req.user?.salon_id) {
    throw new ApiError(403, 'Admin account is missing salon scope', { expose: true });
  }
}

function applySalonScope(query, req) {
  if (isSuperuser(req)) return query;
  ensureAdminSalon(req);
  if (isAdmin(req)) return query.eq('salon_id', req.user.salon_id);
  return query;
}

export const getAllCustomers = async (req, res) => {
  let query = supabase.from('customers').select(CUSTOMER_SELECT_FIELDS);
  query = applySalonScope(query, req);

  let { data, error } = await query;

  if (
    error &&
    (isMissingColumnError(error, 'salon_id') ||
      isMissingColumnError(error, 'updated_at') ||
      isMissingColumnError(error, 'created_by') ||
      isMissingColumnError(error, 'updated_by'))
  ) {
    let legacyScoped = supabase.from('customers').select('id, name, email, created_at');
    legacyScoped = applySalonScope(legacyScoped, req);
    const legacyRes = await legacyScoped;
    data = legacyRes.data;
    error = legacyRes.error;
  }

  if (error) throw new ApiError(500, error.message);
  res.json(data);
};

export const getCustomerById = async (req, res) => {
  const { id } = req.params;

  let query = supabase.from('customers').select(CUSTOMER_SELECT_FIELDS).eq('id', id);
  query = applySalonScope(query, req);

  let { data, error } = await query.maybeSingle();

  if (
    error &&
    (isMissingColumnError(error, 'salon_id') ||
      isMissingColumnError(error, 'updated_at') ||
      isMissingColumnError(error, 'created_by') ||
      isMissingColumnError(error, 'updated_by'))
  ) {
    let legacyScoped = supabase.from('customers').select('id, name, email, created_at').eq('id', id);
    legacyScoped = applySalonScope(legacyScoped, req);
    const legacyRes = await legacyScoped.maybeSingle();
    data = legacyRes.data;
    error = legacyRes.error;
  }

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Customer not found', { expose: true });
  res.json(data);
};

export const createCustomer = async (req, res) => {
  const { name, email, salon_id } = req.body;

  const payload = {
    name,
    email,
    created_by: req.user?.userId,
    updated_by: req.user?.userId,
  };

  if (isSuperuser(req)) {
    if (!salon_id) {
      throw new ApiError(400, 'salon_id is required when superuser creates a customer', { expose: true });
    }
    payload.salon_id = salon_id;
  } else {
    ensureAdminSalon(req);
    payload.salon_id = req.user.salon_id;
  }

  let { data, error } = await supabase.from('customers').insert([payload]).select(CUSTOMER_SELECT_FIELDS);

  if (
    error &&
    (isMissingColumnError(error, 'salon_id') ||
      isMissingColumnError(error, 'created_by') ||
      isMissingColumnError(error, 'updated_by'))
  ) {
    const legacyRes = await supabase.from('customers').insert([{ name, email }]).select('id, name, email, created_at');
    data = legacyRes.data;
    error = legacyRes.error;
  }

  if (error) throw new ApiError(500, error.message);
  res.status(201).json(data);
};

export const updateCustomer = async (req, res) => {
  const { id } = req.params;
  const { name, email, salon_id } = req.body;

  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    updated_by: req.user?.userId,
  };

  if (isSuperuser(req) && salon_id !== undefined) {
    updates.salon_id = salon_id;
  }

  let query = supabase.from('customers').update(updates).eq('id', id);
  query = applySalonScope(query, req);

  let { data, error } = await query.select(CUSTOMER_SELECT_FIELDS);

  if (error && (isMissingColumnError(error, 'updated_by') || isMissingColumnError(error, 'salon_id'))) {
    let legacyQuery = supabase
      .from('customers')
      .update({ ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}) })
      .eq('id', id);
    legacyQuery = applySalonScope(legacyQuery, req);
    const legacyRes = await legacyQuery.select('id, name, email, created_at');
    data = legacyRes.data;
    error = legacyRes.error;
  }

  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Customer not found', { expose: true });
  res.json(data);
};

export const deleteCustomer = async (req, res) => {
  const { id } = req.params;

  let query = supabase.from('customers').delete().eq('id', id);
  query = applySalonScope(query, req);

  let { data, error } = await query.select();

  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Customer not found', { expose: true });
  res.status(204).send();
};
