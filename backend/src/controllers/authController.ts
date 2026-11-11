import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '../models/User.js';
import { env } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const generateToken = (userId: string, email: string, role: UserRole): string => {
  return jwt.sign({ userId, email, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
};

/**
 * Register a new user
 * POST /api/auth/register or /api/v1/auth/register
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  // Check duplicate email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw ApiError.conflict('An account with this email address already exists');
  }

  // Hash password using bcrypt (12 rounds)
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  // Users registered through the public portal always have role: 'user'
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'user',
  });

  const token = generateToken(user._id.toString(), user.email, user.role);

  return ApiResponse.created(res, 'Account created successfully', {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    token,
  });
});

/**
 * Log in User or Admin
 * POST /api/auth/login or /api/v1/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  // Find user by email
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Compare hashed password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = generateToken(user._id.toString(), user.email, user.role);

  return ApiResponse.success(res, {
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    },
  });
});

/**
 * Log out
 * POST /api/auth/logout or /api/v1/auth/logout
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  return ApiResponse.success(res, {
    message: 'Logged out successfully',
  });
});

/**
 * Get current authenticated user profile
 * GET /api/auth/me or /api/v1/auth/me
 */
export const getMe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized('Not authenticated');
  }

  return ApiResponse.success(res, {
    message: 'Authenticated user profile retrieved',
    data: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      createdAt: req.user.createdAt,
    },
  });
});

/**
 * Generate a short-lived single-use AR handoff token
 * POST /api/v1/auth/handoff-token
 */
export const createHandoffToken = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { productId } = req.body;
  if (!productId) {
    throw ApiError.badRequest('productId is required for AR handoff token generation');
  }

  const userId = req.user?._id?.toString() || 'anonymous';
  const handoffToken = jwt.sign(
    {
      userId,
      productId,
      type: 'ar_native_handoff',
    },
    env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  return ApiResponse.success(res, {
    message: 'Native AR handoff token generated successfully',
    data: {
      productId,
      handoffToken,
      deepLink: `smcar://product/${productId}?token=${handoffToken}`,
      universalLink: `https://smc-frontend-cbou.onrender.com/ar/${productId}?token=${handoffToken}`,
      expiresInSeconds: 300,
    },
  });
});

/**
 * Verify a native AR handoff token
 * POST /api/v1/auth/verify-handoff
 */
export const verifyHandoffToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    throw ApiError.badRequest('Handoff token is required');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
      productId: string;
      type: string;
    };

    if (decoded.type !== 'ar_native_handoff') {
      throw ApiError.unauthorized('Invalid handoff token type');
    }

    return ApiResponse.success(res, {
      message: 'Native AR handoff token validated',
      data: {
        valid: true,
        productId: decoded.productId,
        userId: decoded.userId,
      },
    });
  } catch {
    throw ApiError.unauthorized('Native AR handoff token is invalid or has expired');
  }
});
