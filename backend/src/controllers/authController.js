import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = async (req, res) => {
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWT_EXPIRY = process.env.JWT_EXPIRY;
    
    const { name, email, password, role } = req.body;

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

    if (existingUser) {
        throw new ApiError(409, 'Email already registered', { expose: true });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data, error } = await supabase
        .from("users")
        .insert([{ name, email, password: hashedPassword, role }])
        .select('id, name, email, role');

    if (error) throw new ApiError(500, error.message);

    // Generate JWT token
    const token = jwt.sign(
        { userId: data[0].id, email: data[0].email, role: data[0].role },
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

    // Find user
    const { data: user, error } = await supabase
        .from("users")
        .select("id, name, email, password, role")
        .eq("email", email)
        .single();

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
        { userId: user.id, email: user.email, role: user.role },
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

    const { data, error } = await supabase
        .from("users")
        .select('id, name, email, role, created_at')
        .eq("id", userId)
        .single();

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
