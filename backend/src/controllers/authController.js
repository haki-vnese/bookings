import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

function isMissingColumnError(error, columnName) {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    const code = String(error.code || '').toUpperCase();
    return code === 'PGRST204' && message.includes(`'${String(columnName).toLowerCase()}' column`);
}

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = async (req, res) => {
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWT_EXPIRY = process.env.JWT_EXPIRY;
    
    const { name, email, password, role, salon_id } = req.body;

    if (!JWT_SECRET || !JWT_EXPIRY) {
        throw new ApiError(500, 'Server auth configuration is missing');
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

    if (checkError) {
        throw new ApiError(500, checkError.message);
    }
    if (existingUser) {
        throw new ApiError(409, 'Email already registered', { expose: true });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    let { data, error } = await supabase
        .from("users")
        .insert([{ name, email, password: hashedPassword, role, salon_id: salon_id || null }])
        .select('id, name, email, role, salon_id');

    if (error && isMissingColumnError(error, 'salon_id')) {
        const legacyRes = await supabase
            .from('users')
            .insert([{ name, email, password: hashedPassword, role }])
            .select('id, name, email, role');
        data = legacyRes.data;
        error = legacyRes.error;
    }

    if (error) throw new ApiError(500, error.message);

    // Generate JWT token
    const token = jwt.sign(
        {
            userId: data[0].id,
            email: data[0].email,
            role: data[0].role,
            salon_id: data[0].salon_id || null,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
        message: 'User registered successfully',
        user: data[0],
        token
    });
}

/**
 * Login user
 * POST /api/auth/login
 */
export const login = async (req, res) => {
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWT_EXPIRY = process.env.JWT_EXPIRY;
    
    const { email, password } = req.body;

    if (!JWT_SECRET || !JWT_EXPIRY) {
        throw new ApiError(500, 'Server auth configuration is missing');
    }

    // Find user
    let { data: user, error } = await supabase
        .from("users")
        .select("id, name, email, password, role, salon_id")
        .eq("email", email)
        .maybeSingle();

    if (error && isMissingColumnError(error, 'salon_id')) {
        const legacyRes = await supabase
            .from('users')
            .select('id, name, email, password, role')
            .eq('email', email)
            .maybeSingle();
        user = legacyRes.data;
        error = legacyRes.error;
    }

    if (error) throw new ApiError(500, error.message);
    if (!user) {
        throw new ApiError(401, 'Invalid email or password', { expose: true });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        throw new ApiError(401, 'Invalid email or password', { expose: true });
    }

    // Generate JWT token
    const token = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.role,
            salon_id: user.salon_id || null,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
        message: 'Login successful',
        user: userWithoutPassword,
        token
    });
}

/**
 * Get current user profile
 * GET /api/auth/me
 * Requires: valid JWT token
 */
export const getCurrentUser = async (req, res) => {
    const userId = req.user.userId;

    let { data, error } = await supabase
        .from("users")
        .select('id, name, email, role, salon_id, created_at, updated_at')
        .eq("id", userId)
        .maybeSingle();

    if (error && (isMissingColumnError(error, 'salon_id') || isMissingColumnError(error, 'updated_at'))) {
        const legacyRes = await supabase
            .from('users')
            .select('id, name, email, role, created_at')
            .eq('id', userId)
            .maybeSingle();
        data = legacyRes.data;
        error = legacyRes.error;
    }

    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'User not found', { expose: true });

    res.json(data);
}

/**
 * Logout user (client-side: remove token from localStorage)
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
    // JWT is stateless, so logout is just removing token on client side
    res.json({ message: 'Logout successful' });
}

/**
 * Verify JWT token
 * POST /api/auth/verify
 */
export const verifyToken = async (req, res) => {
    const JWT_SECRET = process.env.JWT_SECRET;
    
    const token = req.body.token || req.headers.authorization?.split(' ')[1];

    if (!JWT_SECRET) {
        throw new ApiError(500, 'Server auth configuration is missing');
    }
    if (!token) {
        throw new ApiError(401, 'No token provided', { expose: true });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, user: decoded });
    } catch (err) {
        throw new ApiError(401, 'Invalid or expired token', { expose: true });
    }
}
