import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const CUSTOMER_SELECT_FIELDS = 'id, name, email, company_id, salon_id, created_at, updated_at, created_by, updated_by';

const isSuperuser = (req) => req.user?.role === 'superuser';
const isAdmin = (req) => req.user?.role === 'admin';

function ensureAdminCompany(req) {
  if (isAdmin(req) && !req.user?.company_id && !req.user?.salon_id) {
    throw new ApiError(403, 'Admin account is missing scope', { expose: true });
  }
}

function applyCustomerScope(query, req) {
  if (isSuperuser(req)) return query;
  ensureAdminCompany(req);
  if (isAdmin(req)) {
    if (req.user.company_id) return query.eq('company_id', req.user.company_id);
    return query.eq('salon_id', req.user.salon_id);
  }
  return query;
}

async function withSalonName(customers) {
  const rows = Array.isArray(customers) ? customers : [];
  const salonIds = [...new Set(rows.map((row) => row.salon_id).filter(Boolean))];
  if (salonIds.length === 0) return rows;

  const { data: salons, error } = await supabase
    .from('salons')
    .select('id, name')
    .in('id', salonIds);

  if (error) return rows;

  const salonMap = new Map((salons || []).map((salon) => [salon.id, salon.name]));
  return rows.map((row) => ({
    ...row,
    salon_name: row.salon_id ? salonMap.get(row.salon_id) || null : null,
  }));
}

export const getAllCustomers = async (req, res) => {
  let query = supabase.from('customers').select(CUSTOMER_SELECT_FIELDS);
  query = applyCustomerScope(query, req);

  const { data, error } = await query;

  if (error) throw new ApiError(500, error.message);
  res.json(await withSalonName(data));
};

export const getCustomerById = async (req, res) => {
  const { id } = req.params;

  let query = supabase.from('customers').select(CUSTOMER_SELECT_FIELDS).eq('id', id);
  query = applyCustomerScope(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Customer not found', { expose: true });
  const rows = await withSalonName(data ? [data] : []);
  res.json(rows[0]);
};

export const createCustomer = async (req, res) => {
  const { name, email, salon_id } = req.body;

  const payload = {
    name,
    email,
    company_id: null,
    created_by: req.user?.userId,
    updated_by: req.user?.userId,
  };

  if (isSuperuser(req)) {
    if (!salon_id) {
      throw new ApiError(400, 'salon_id is required when superuser creates a customer', { expose: true });
    }
    payload.salon_id = salon_id;
    payload.company_id = req.body.company_id || null;
  } else {
    ensureAdminCompany(req);
    if (!salon_id) {
      throw new ApiError(400, 'salon_id is required for admin customer creation', { expose: true });
    }
    payload.company_id = req.user.company_id;
    payload.salon_id = salon_id;
  }

  const { data, error } = await supabase.from('customers').insert([payload]).select(CUSTOMER_SELECT_FIELDS);

  if (error) throw new ApiError(500, error.message);
  res.status(201).json(await withSalonName(data));
};

export const updateCustomer = async (req, res) => {
  const { id } = req.params;
  const { name, email, salon_id, company_id } = req.body;

  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    updated_by: req.user?.userId,
  };

  if (isSuperuser(req) && salon_id !== undefined) {
    updates.salon_id = salon_id;
  }
  if (isSuperuser(req) && company_id !== undefined) {
    updates.company_id = company_id;
  }

  let query = supabase.from('customers').update(updates).eq('id', id);
  query = applyCustomerScope(query, req);

  const { data, error } = await query.select(CUSTOMER_SELECT_FIELDS);

  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Customer not found', { expose: true });
  res.json(await withSalonName(data));
};

export const deleteCustomer = async (req, res) => {
  const { id } = req.params;

  let query = supabase.from('customers').delete().eq('id', id);
  query = applyCustomerScope(query, req);

  let { data, error } = await query.select();

  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Customer not found', { expose: true });
  res.status(204).send();
};
