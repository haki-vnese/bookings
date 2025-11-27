import { supabase } from '../db/supabase.js';

export const getAllTechnicianServices = async (req, res) => {
    const { data, error } = await supabase.from('technician_services').select('*');
    if (error) {
        return res.status(500).json({ error: error.message });
    }   
    res.json(data);
}

export const getTechnicianServiceById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('technician_services').select('*').eq('id', id).single();
    if (error) {
        return res.status(404).json({ error: error.message });
    }
    res.json(data);
}   

export const createTechnicianService = async (req, res) => {
    const { technician_id, service_id, price } = req.body;
    const { data, error } = await supabase.from('technician_services').insert([{ technician_id, service_id, price }]).select();

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
}

export const deleteTechnicianService = async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('technician_services').delete().eq('id', id);
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(204).send();
}       
