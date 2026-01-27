import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

export const getAllTechnicianServices = async (req, res) => {
    const { data, error } = await supabase.from('technician_services').select('*');
    if (error) throw new ApiError(500, error.message);
    res.json(data);
}

export const getTechnicianServiceById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('technician_services').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Technician service not found', { expose: true });
    res.json(data);
}   

export const createTechnicianService = async (req, res) => {
    const { technician_id, service_id, price } = req.body;
    const { data, error } = await supabase.from('technician_services').insert([{ technician_id, service_id, price }]).select();

    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data);
}

export const deleteTechnicianService = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('technician_services').delete().eq('id', id).select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Technician service not found', { expose: true });
    res.status(204).send();
}       
