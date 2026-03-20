/**
 * Technician-services controller — manages which services a technician offers.
 *
 * Each row links a technician to a service and optionally overrides the
 * default price.  Like services, these rows are currently global.
 */
import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

/**
 * GET /api/technician-services
 *
 * Returns all technician–service assignments.  Admin/superuser only
 * (enforced at route level).
 *
 * @example
 * // Response 200
 * [{ "id": "...", "technician_id": "...", "service_id": "...", "price": 40 }]
 */
export const getAllTechnicianServices = async (req, res) => {
    const { data, error } = await supabase.from('technician_services').select('*');
    if (error) throw new ApiError(500, error.message);
    res.json(data);
}

/**
 * GET /api/technician-services/:id
 *
 * Returns a single technician–service link by UUID.  404 if not found.
 */
export const getTechnicianServiceById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('technician_services').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Technician service not found', { expose: true });
    res.json(data);
}

/**
 * POST /api/technician-services
 *
 * Links a technician to a service, optionally overriding the default price.
 *
 * @param {string} req.body.technician_id  — UUID of the technician (staff or user)
 * @param {string} req.body.service_id     — UUID of the service
 * @param {number} [req.body.price]        — custom price (falls back to service default)
 */
export const createTechnicianService = async (req, res) => {
    const { technician_id, service_id, price } = req.body;
    const { data, error } = await supabase.from('technician_services').insert([{ technician_id, service_id, price }]).select();

    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data);
}

/**
 * DELETE /api/technician-services/:id
 *
 * Removes a technician–service link.  Returns 204 on success, 404 if
 * the assignment does not exist.
 */
export const deleteTechnicianService = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('technician_services').delete().eq('id', id).select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Technician service not found', { expose: true });
    res.status(204).send();
}       
