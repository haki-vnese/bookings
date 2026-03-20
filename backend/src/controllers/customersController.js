/**
 * Customers controller — CRUD with tenant-scoped visibility.
 *
 * Admins see customers within their company/salon; superusers see all.
 * New customers must always be assigned to a salon.  The `withSalonName`
 * enrichment helper annotates response rows with the human-readable
 * salon name for display purposes.
 */
import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { isSuperuser, isAdmin, ensureAdminScope } from '../utils/roles.js';
import { withSalonName } from '../utils/enrichment.js';

const CUSTOMER_SELECT_FIELDS = 'id, name, email, phone, company_id, salon_id, created_at, updated_at, created_by, updated_by';

/**
 * Narrows a Supabase query to the customers visible to the current user.
 *
 * - Superuser  → no filter (sees all customers across all tenants).
 * - Admin      → scoped to their company; falls back to salon if no
 *                company is set.  Throws 403 if neither is present.
 * - Other      → query returned unmodified (route-level auth should
 *                prevent non-admin/non-superuser access).
 *
 * @param {object} query  — Supabase query builder
 * @param {object} req    — Express request with `req.user`
 * @returns {object}        The (possibly narrowed) Supabase query
 */
function applyCustomerScope(query, req) {
  if (isSuperuser(req)) return query;
  ensureAdminScope(req);
  if (isAdmin(req)) {
    if (req.user.company_id) return query.eq('company_id', req.user.company_id);
    return query.eq('salon_id', req.user.salon_id);
  }
  return query;
}

/**
 * GET /api/customers
 *
 * Returns all customers visible to the authenticated user, enriched
 * with `salon_name` for display.
 *
 * @example
 * // Response 200
 * [{ "id": "...", "name": "Jane Doe", "salon_id": "...", "salon_name": "Downtown Nails" }]
 */
export const getAllCustomers = async (req, res) => {
  let query = supabase.from('customers').select(CUSTOMER_SELECT_FIELDS);
  query = applyCustomerScope(query, req);

  const { data, error } = await query;

  if (error) throw new ApiError(500, error.message);
  res.json(await withSalonName(data));
};

/**
 * GET /api/customers/:id
 *
 * Returns a single customer by UUID, scope-checked and enriched
 * with `salon_name`.  Returns 404 if not found or out of scope.
 */
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

/**
 * POST /api/customers
 *
 * Creates a new customer.  `salon_id` is always required — customers
 * must be associated with a physical salon.
 *
 * - Superuser  → must explicitly provide `salon_id`.
 * - Admin      → customer is pinned to the admin's company; `salon_id`
 *                is required to determine which location.
 *
 * @param {string} req.body.name      — customer name
 * @param {string} req.body.email     — customer email
 * @param {string} [req.body.phone]   — optional phone number
 * @param {string} req.body.salon_id  — UUID of the salon
 */
export const createCustomer = async (req, res) => {
  const { name, email, phone, salon_id } = req.body;

  const payload = {
    name,
    email,
    phone: phone || null,
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
    ensureAdminScope(req);
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

/**
 * PUT /api/customers/:id
 *
 * Partially updates a customer.  Only provided fields are overwritten.
 * Superusers may reassign `salon_id` and `company_id`;  admins cannot
 * move customers across tenants.
 */
export const updateCustomer = async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, salon_id, company_id } = req.body;

  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(phone !== undefined ? { phone } : {}),
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

/**
 * DELETE /api/customers/:id
 *
 * Removes a customer record.  Scope-checked — admins can only delete
 * customers within their own tenant.  Returns 204 on success.
 */
export const deleteCustomer = async (req, res) => {
  const { id } = req.params;

  let query = supabase.from('customers').delete().eq('id', id);
  query = applyCustomerScope(query, req);

  let { data, error } = await query.select();

  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Customer not found', { expose: true });
  res.status(204).send();
};
