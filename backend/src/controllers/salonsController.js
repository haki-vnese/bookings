import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const SALON_SELECT_FIELDS = 'id, name, company_id, address_id, created_at, updated_at';

function isSuperuser(req) {
  return req.user?.role === 'superuser';
}

function isAdmin(req) {
  return req.user?.role === 'admin';
}

function applySalonScope(query, req) {
  if (isSuperuser(req)) return query;
  if (isAdmin(req) && req.user?.company_id) {
    return query.eq('company_id', req.user.company_id);
  }
  return query;
}

export const getAllSalons = async (req, res) => {
  let query = supabase.from('salons').select(SALON_SELECT_FIELDS);
  query = applySalonScope(query, req);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  res.json(data || []);
};
