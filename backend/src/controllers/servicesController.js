import { supabase } from '../db/supabase.js';

export const getAllServices = async (req, res) => {
    const { data, error } = await supabase.from('services').select('*');
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
}

export const getServiceById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('services').select('*').eq('id', id).single();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
}

export const createService = async (req, res) => {
    const { name, description, duration, price } = req.body;
    const { data, error } = await supabase.from('services').insert([{ name, description, duration, price }]).select();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
}

export const updateService = async (req, res) => {
    const { id } = req.params;
    const { name, description, duration, price } = req.body;
    const { data, error } = await supabase.from('services').update({ name, description, duration_minutes, price }).eq('id', id).select();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);  
}

export const deleteService = async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(204).send();
}