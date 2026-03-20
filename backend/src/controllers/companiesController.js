/**
 * Companies controller — CRUD for company entities.
 *
 * Only superusers can create, update, or delete companies.
 * Admins can view companies scoped to their own `company_id`.
 */
import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { isSuperuser, isAdmin } from '../utils/roles.js';

const COMPANY_SELECT_FIELDS = 'id, name, address_id, created_at, created_by, updated_at, updated_by';

/**
 * Narrows a Supabase query to the companies visible to the current user.
 *
 * - Superuser  → no filter (sees all companies).
 * - Admin      → restricted to their own `company_id`.
 * - Other      → query returned unmodified.
 *
 * @param {object} query  — Supabase query builder
 * @param {object} req    — Express request with `req.user`
 * @returns {object}        The (possibly narrowed) Supabase query
 */
function applyCompanyScope(query, req) {
  if (isSuperuser(req)) return query;
  if (isAdmin(req) && req.user?.company_id) {
    return query.eq('id', req.user.company_id);
  }
  return query;
}

/**
 * GET /api/companies
 *
 * Returns all companies visible to the authenticated user.
 * Superusers see all; admins see only their own company.
 *
 * @example
 * // Response 200
 * [{ "id": "...", "name": "Fancy Nails Inc.", "address_id": "..." }]
 */
export const getAllCompanies = async (req, res) => {
  let query = supabase.from('companies').select(COMPANY_SELECT_FIELDS);
  query = applyCompanyScope(query, req);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  res.json(data || []);
};

/**
 * GET /api/companies/:id
 *
 * Returns a single company by UUID.  Scope-checked — admins can only
 * fetch their own company.
 */
export const getCompanyById = async (req, res) => {
  const { id } = req.params;
  let query = supabase.from('companies').select(COMPANY_SELECT_FIELDS).eq('id', id).maybeSingle();
  query = applyCompanyScope(query, req);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Company not found', { expose: true });
  res.json(data);
};

/**
 * POST /api/companies
 *
 * Creates a new company.  Superuser-only (enforced at route level).
 *
 * @param {string} req.body.name          — company name
 * @param {string} [req.body.address_id]  — optional address UUID
 */
export const createCompany = async (req, res) => {
  const { name, address_id } = req.body;

  const payload = {
    name,
    address_id: address_id || null,
    created_by: req.user?.userId,
    updated_by: req.user?.userId,
  };

  const { data, error } = await supabase.from('companies').insert([payload]).select(COMPANY_SELECT_FIELDS);
  if (error) throw new ApiError(500, error.message);
  res.status(201).json(data || []);
};

/**
 * PUT /api/companies/:id
 *
 * Partially updates a company.  Only provided fields are overwritten.
 * Scope-checked for admins; superuser-only for writes (route level).
 */
export const updateCompany = async (req, res) => {
  const { id } = req.params;
  const { name, address_id } = req.body;

  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(address_id !== undefined ? { address_id } : {}),
    updated_by: req.user?.userId,
  };

  let query = supabase.from('companies').update(updates).eq('id', id);
  query = applyCompanyScope(query, req);

  const { data, error } = await query.select(COMPANY_SELECT_FIELDS);
  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Company not found', { expose: true });
  res.json(data);
};

/**
 * DELETE /api/companies/:id
 *
 * Removes a company.  Superuser-only.  Returns 204 on success.
 */
export const deleteCompany = async (req, res) => {
  const { id } = req.params;
  let query = supabase.from('companies').delete().eq('id', id);
  query = applyCompanyScope(query, req);

  const { data, error } = await query.select('id');
  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Company not found', { expose: true });
  res.status(204).send();
};
