import { supabase } from "../db/supabase.js";

export const getAllUsers = async (req, res) => {
  const { data, error } = await supabase.from("users").select("*"); 

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
}   

export const getUserById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("users").select("*").eq("id", id).single();

    if (error) {
      return res.status(404).json({ error: error.message });
    }   
    res.json(data);
}

export const createUser = async (req, res) => {
    const { name, email, role } = req.body;
    const { data, error } = await supabase.from("users").insert([{ name, email, role }]).select();
    if (error) {
        return res.status(500).json({ error: error.message });  
    }
    res.status(201).json(data); 
}

export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, role } = req.body;
    const { data, error } = await supabase.from("users").update({ name, email, role }).eq("id", id).select();       
    if (error) {
        return res.status(500).json({ error: error.message });
    }   
    res.json(data);
}

export const deleteUser = async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) {
        return res.status(500).json({ error: error.message });
    }   
    res.status(204).send();
}       

export const getTechnicians = async (req, res) => {
    const { data, error } = await supabase.from("users").select("*").eq("role", "technician");
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
}       
export const getCustomers = async (req, res) => {
    const { data, error } = await supabase.from("users").select("*").eq("role", "customer");
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
}       

