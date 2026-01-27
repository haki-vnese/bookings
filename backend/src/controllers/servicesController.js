import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

export const getAllServices = async (req, res) => {
    const { data, error } = await supabase.from('services').select('*');
    if (error) throw new ApiError(500, error.message);
    res.json(data);
}

export const getServiceById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('services').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Service not found', { expose: true });
    res.json(data);
}

export const createService = async (req, res) => {
    const { name, description, duration_minutes, price } = req.body;
    const { data, error } = await supabase.from('services').insert([{ name, description, duration_minutes, price }]).select();
    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data);
}

export const updateService = async (req, res) => {
    const { id } = req.params;
    const { name, description, duration_minutes, price } = req.body;
    const { data, error } = await supabase.from('services').update({ name, description, duration_minutes, price }).eq('id', id).select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Service not found', { expose: true });
    res.json(data);  
}

export const deleteService = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('services').delete().eq('id', id).select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Service not found', { expose: true });
    res.status(204).send();
}
