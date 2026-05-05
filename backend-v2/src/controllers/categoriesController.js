// src/controllers/categoriesController.js

import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const FIELDS = `
  id,
  name,
  slug, 
  description,
  sort_order,
  is_active,
  online,
  checkin,
  created_at,
  updated_at,
  color,
  salon_id
`;

//  map các trường từ database sang định dạng API trả về cho UI
function toApiCategory(dbCategoryRow) {
    return {
        id: dbCategoryRow.id,
        salonId: dbCategoryRow.salon_id,
        name: dbCategoryRow.name,
        slug: dbCategoryRow.slug ?? null,
        description: dbCategoryRow.description ?? '',
        sortOrder: dbCategoryRow.sort_order ?? 0,
        isActive: Boolean(dbCategoryRow.is_active),
        online: dbCategoryRow.online ?? true,
        checkin: dbCategoryRow.checkin ?? true,
        createdAt: dbCategoryRow.created_at,
        updatedAt: dbCategoryRow.updated_at,
        color: dbCategoryRow.color ?? '',
    };
}

function slugify(name) {
    return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

// Lấy tất cả categories của salon đang login
export const getAllCategories = async (req, res) => {
    const salonId = req.salonId;
    if (!salonId) { 
        throw new ApiError(400, 'Salon ID is required', { expose: true });
    }

    const { data, error } = await supabase
        .from('categories')
        .select(FIELDS)
        .eq('salon_id', salonId)
        .order('sort_order', { ascending: true })
        .order('is_active', { ascending: false }); // Active categories first

    if (error) {
         console.error("getAllCategories error:", error);
        throw new ApiError(500, 'Failed to fetch categories', { details: error });
    }

    res.json(data.map(toApiCategory));
}

// Lấy category theo ID
export const getCategoryById = async (req, res) => {
    const salonId = req.salonId;
    const categoryId = req.params.id;

    if (!salonId) {
        throw new ApiError(400, 'Salon ID is required', { expose: true });
    }

    if (!categoryId) {
        throw new ApiError(400, 'Category ID is required', { expose: true });
    }

    const { data, error } = await supabase
        .from('categories')
        .select(FIELDS)
        .eq('salon_id', salonId)
        .eq('id', categoryId)
        .single(); // Expect exactly one row, error if not found or multiple found

    if (error) {
        if (error.code === 'PGRST116') { // No rows found
            throw new ApiError(404, 'Category not found', { expose: true });
        }

        throw new ApiError(500, 'Failed to fetch category', { details: error });
    }

    res.json(toApiCategory(data));
}

// Tạo mới category cho salon đang login
export const createCategory = async (req, res) => {
    const salonId = req.salonId;
    const { name, description, color, online, checkin } = req.body;

    if (!salonId) {
        throw new ApiError(400, 'Salon ID is required', { expose: true });
    }

    if (!name) {
        throw new ApiError(400, 'Category name is required', { expose: true });
    }

    const slug = slugify(name);

    const { data, error } = await supabase
        .from('categories')
        .insert([
            {
                salon_id: salonId,
                name,
                slug,
                description: description ?? '',
                color: color ?? '',
                online: Boolean(online),
                checkin: Boolean(checkin),
            }
        ])
        .select(FIELDS)
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to create category', { details: error });
    }

    res.status(201).json(toApiCategory(data));
}

// Cập nhật category theo ID
export const updateCategory = async (req, res) => {
    const salonId = req.salonId;
    const categoryId = req.params.id;
    const { name, description, color, online, checkin, isActive } = req.body;

    if (!salonId) {
        throw new ApiError(400, 'Salon ID is required', { expose: true });
    }

    if (!categoryId) {
        throw new ApiError(400, 'Category ID is required', { expose: true });
    }

    const updateData = {};
    if (name) {
        updateData.name = name;
        updateData.slug = slugify(name);
    }

    if (description !== undefined) {
        updateData.description = description;
    }   

    if (color !== undefined) {
        updateData.color = color;
    }

    if (online !== undefined) {
        updateData.online = Boolean(online);
    }   

    if (checkin !== undefined) {
        updateData.checkin = Boolean(checkin);
    }   

    if (isActive !== undefined) {
        updateData.is_active = Boolean(isActive);
    }

    const { data, error } = await supabase
        .from('categories')
        .update(updateData) 
        .eq('salon_id', salonId)
        .eq('id', categoryId)
        .select(FIELDS)
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') { // No rows found
            throw new ApiError(404, 'Category not found', { expose: true });
        }
        throw new ApiError(500, 'Failed to update category', { details: error });
    }

    res.json(toApiCategory(data));  
}

// Xóa category theo ID (thực tế chỉ set is_active = false)
export const deleteCategory = async (req, res) => {
    const salonId = req.salonId;
    const categoryId = req.params.id;   

    if (!salonId) {
        throw new ApiError(400, 'Salon ID is required', { expose: true });
    }

    if (!categoryId) {
        throw new ApiError(400, 'Category ID is required', { expose: true });
    }   

    const { data, error } = await supabase
        .from('categories')
        .update({ is_active: false })
        .eq('salon_id', salonId)
        .eq('id', categoryId)
        .select(FIELDS)
        .single();

    if (error) {
        if (error.code === 'PGRST116') { // No rows found
            throw new ApiError(404, 'Category not found', { expose: true });
        }
        throw new ApiError(500, 'Failed to delete category', { details: error });
    }   

    res.json(toApiCategory(data));
}

export const seedCategoriesIfEmpty = async (req, res) => {
    const salonId = req.salonId;   
    if (!salonId) {
        throw new ApiError(400, 'Salon ID is required', { expose: true });
    }

    // Kiểm tra nếu đã có category nào cho salon này chưa
    const { data: existingCategories, error: fetchError } = await supabase
        .from('categories')
        .select('id')
        .eq('salon_id', salonId)
        .limit(1);

    if (fetchError) {
        throw new ApiError(500, 'Failed to check existing categories', { details: fetchError });
    }

    if (existingCategories.length > 0) {
        return res.json({ message: 'Categories already exist, seeding skipped' });
    }

    // Nếu chưa có category nào, tiến hành seed
    const defaultCategories = [
        { name: 'Nail Services', description: 'All nail related services', color: '#FFB6C1' },
        { name: 'Hair Services', description: 'All hair related services', color: '#ADD8E6' },
        { name: 'Skin Care', description: 'Facials and skin treatments', color: '#90EE90' },
        { name: 'Massage', description: 'Relaxing massage services', color: '#FFD700' },
    ];

    const insertData = defaultCategories.map(cat => ({
        salon_id: salonId,
        name: cat.name,
        slug: slugify(cat.name),
        description: cat.description,
        color: cat.color,
        online: true,
        checkin: true,
    }));

    const { data, error: insertError } = await supabase
        .from('categories')
        .insert(insertData)
        .select(FIELDS);

    if (insertError) {
        throw new ApiError(500, 'Failed to seed categories', { details: insertError });
    }

    res.status(201).json(data.map(toApiCategory));
}
