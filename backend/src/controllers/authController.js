/**
 * Auth controller — registration, login, token verification, and logout.
 *
 * Registration can optionally require admin authorization for privileged
 * roles (admin, staff, superuser) when `REQUIRE_ADMIN_TOKEN_FOR_PRIVILEGED_REGISTER`
 * is set to `"true"`.
 *
 * Login supports both email and username look-ups (case-insensitive).
 * Only bcrypt-hashed passwords are accepted — legacy plain-text rows
 * must go through an admin-initiated password reset.
 *
 * JWT payload shape (consumed by auth middleware):
 *   { userId, email, role, company_id, salon_id }
 */
import { supabase } from "../db/supabase.js";
import ApiError from '../utils/ApiError.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ══════════════════════════════════════════════════════════════════════════
//  Registration
// ══════════════════════════════════════════════════════════════════════════

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = async (req, res) => {
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWT_EXPIRY = process.env.JWT_EXPIRY;
    
    const { name, email, username, password, role, salon_id, company_id } = req.body;

    if (!JWT_SECRET || !JWT_EXPIRY) {
        throw new ApiError(500, 'Server auth configuration is missing');
    }

    const requirePrivilegedRegisterToken = String(process.env.REQUIRE_ADMIN_TOKEN_FOR_PRIVILEGED_REGISTER || 'false').toLowerCase() === 'true';
    if (requirePrivilegedRegisterToken && ['superuser', 'admin', 'staff'].includes(String(role || '').toLowerCase())) {
        const authHeader = req.headers.authorization || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (!bearerToken) {
            throw new ApiError(403, 'Creating privileged accounts requires admin authorization', { expose: true });
        }

        let actor = null;
        try {
            actor = jwt.verify(bearerToken, JWT_SECRET);
        } catch {
            throw new ApiError(403, 'Invalid admin authorization token', { expose: true });
        }

        if (!['superuser', 'admin'].includes(String(actor?.role || '').toLowerCase())) {
            throw new ApiError(403, 'Only admin or superuser can create privileged accounts', { expose: true });
        }
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id, username")
        .eq("email", email)
        .maybeSingle();

    if (checkError) throw new ApiError(500, checkError.message);
    if (existingUser) {
        throw new ApiError(409, 'Email already registered', { expose: true });
    }

    if (username) {
        const { data: existingUsername, error: usernameError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (usernameError) throw new ApiError(500, usernameError.message);
        if (existingUsername) {
            throw new ApiError(409, 'Username already registered', { expose: true });
        }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data, error } = await supabase
        .from("users")
        .insert([
            {
                name,
                email,
                username: username || null,
                password: hashedPassword,
                role,
                company_id: company_id || null,
                salon_id: salon_id || null,
            },
        ])
        .select('id, name, email, username, role, company_id, salon_id');

    if (error) throw new ApiError(500, error.message);

    // Generate JWT token
    const token = jwt.sign(
        {
            userId: data[0].id,
            email: data[0].email,
            role: data[0].role,
            company_id: data[0].company_id || null,
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
    
    const identifier = String(req.body.identifier || req.body.email || '').trim();
    const normalizedIdentifier = identifier.toLowerCase();
    const { password } = req.body;

    if (!JWT_SECRET || !JWT_EXPIRY) {
        throw new ApiError(500, 'Server auth configuration is missing');
    }

    // Find user by email or username (case-insensitive)
    let { data: user, error } = await supabase
        .from("users")
        .select("id, name, email, username, password, role, company_id, salon_id")
        .ilike("email", normalizedIdentifier)
        .maybeSingle();

    if (!user && !error) {
        const usernameRes = await supabase
            .from('users')
            .select('id, name, email, username, password, role, company_id, salon_id')
            .ilike('username', identifier)
            .maybeSingle();
        user = usernameRes.data;
        error = usernameRes.error;
    }

    if (error) throw new ApiError(500, error.message);
    if (!user) {
        throw new ApiError(401, 'Invalid email or password', { expose: true });
    }

    // Verify password — only bcrypt hashes are accepted.
    // Legacy plain-text passwords are no longer auto-migrated; affected
    // users must go through an admin-initiated password reset.
    let isPasswordValid = false;
    const storedPassword = typeof user.password === 'string' ? user.password : '';
    const isBcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedPassword);

    if (isBcryptHash) {
        isPasswordValid = await bcrypt.compare(password, storedPassword);
    }
    // If the stored value is not a bcrypt hash the login attempt always
    // fails.  This eliminates the timing-attack vector that existed when
    // plain-text comparison was used as a fallback.

    if (!isPasswordValid) {
        throw new ApiError(401, 'Invalid email or password', { expose: true });
    }

    // Generate JWT token
    const token = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.role,
            company_id: user.company_id || null,
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
        .select('id, name, email, username, role, company_id, salon_id, created_at, updated_at')
        .eq("id", userId)
        .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'User not found', { expose: true });

    let salonName = null;
    if (data.salon_id) {
        const { data: salon, error: salonError } = await supabase
            .from('salons')
            .select('name')
            .eq('id', data.salon_id)
            .maybeSingle();

        if (!salonError && salon?.name) {
            salonName = salon.name;
        }
    }

    if (salonName) {
        data = { ...data, salon_name: salonName };
    }

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
