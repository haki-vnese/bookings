/**
 * Services controller — CRUD for the shared service catalogue.
 *
 * Services are currently global (not tenant-scoped).  All authenticated
 * users can read; only admin/superuser can write.
 */
import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

/**
 * GET /api/services
 *
 * Returns every service in the catalogue.  No authentication required
 * on the read path — the route file gates write operations instead.
 *
 * @example
 * // Response 200
 * [{ "id": "...", "name": "Gel Manicure", "duration_minutes": 45, "price": 35 }]
 */
export const getAllServices = async (req, res) => {
    const { data, error } = await supabase.from('services').select('*');
    if (error) throw new ApiError(500, error.message);
    res.json(data);
}

/**
 * GET /api/services/:id
 *
 * Returns a single service by UUID.  Returns 404 if not found.
 */
export const getServiceById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('services').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Service not found', { expose: true });
    res.json(data);
}

/**
 * POST /api/services
 *
 * Creates a new service in the catalogue.
 * Requires admin or superuser role (enforced at the route level).
 *
 * @param {string} req.body.name              — human-readable service name
 * @param {string} [req.body.description]      — optional description
 * @param {number} req.body.duration_minutes   — slot length in minutes
 * @param {number} req.body.price              — base price
 */
export const createService = async (req, res) => {
    const { name, description, duration_minutes, price } = req.body;
    const { data, error } = await supabase.from('services').insert([{ name, description, duration_minutes, price }]).select();
    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data);
}

/**
 * PUT /api/services/:id
 *
 * Partially updates a service.  Only provided fields are overwritten.
 * Returns 404 if the service does not exist.
 */
export const updateService = async (req, res) => {
    const { id } = req.params;
    const { name, description, duration_minutes, price } = req.body;
    const { data, error } = await supabase.from('services').update({ name, description, duration_minutes, price }).eq('id', id).select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Service not found', { expose: true });
    res.json(data);  
}

/**
 * DELETE /api/services/:id
 *
 * Removes a service from the catalogue.  Returns 204 on success, 404 if
 * the service does not exist.
 */
export const deleteService = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('services').delete().eq('id', id).select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Service not found', { expose: true });
    res.status(204).send();
}
