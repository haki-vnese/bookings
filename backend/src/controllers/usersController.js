import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';

export const getAllUsers = async (req, res) => {
    const { data, error } = await supabase.from("users").select("id, name, email, role, created_at"); 

    if (error) throw new ApiError(500, error.message);
    res.json(data);
}   

export const getUserById = async (req, res) => {
        const { id } = req.params;
        const { data, error } = await supabase.from("users").select("id, name, email, role, created_at").eq("id", id).single();

        if (error) throw new ApiError(500, error.message);
        if (!data) throw new ApiError(404, 'User not found', { expose: true });
        res.json(data);
}

export const createUser = async (req, res) => {
    const { name, email, role } = req.body;
    const { data, error } = await supabase.from("users").insert([{ name, email, role }]).select();
    if (error) throw new ApiError(500, error.message);
    res.status(201).json(data); 
}

export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, role } = req.body;
    const { data, error } = await supabase.from("users").update({ name, email, role }).eq("id", id).select();       
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'User not found', { expose: true });
    res.json(data);
}

export const deleteUser = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("users").delete().eq("id", id).select();
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'User not found', { expose: true });
    res.status(204).send();
}       

export const getTechnicians = async (req, res) => {
    const { data, error } = await supabase.from("users").select("id, name, email, role, created_at").eq("role", "technician");
    if (error) throw new ApiError(500, error.message);
    res.json(data);
}       
export const getCustomers = async (req, res) => {
    const { data, error } = await supabase.from("users").select("id, name, email, role, created_at").eq("role", "customer");
    if (error) throw new ApiError(500, error.message);
    res.json(data);
}       

