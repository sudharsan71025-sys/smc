import { apiClient } from './api-client';
import { ApiResponse } from '@/types/api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface AuthResponseData {
  user: UserProfile;
  token: string;
}

export const authService = {
  register: async (payload: {
    name: string;
    email: string;
    password: string;
    confirmPassword?: string;
  }): Promise<ApiResponse<AuthResponseData>> => {
    return (await apiClient.post(
      '/auth/register',
      payload
    )) as unknown as ApiResponse<AuthResponseData>;
  },

  login: async (payload: {
    email: string;
    password: string;
  }): Promise<ApiResponse<AuthResponseData>> => {
    return (await apiClient.post(
      '/auth/login',
      payload
    )) as unknown as ApiResponse<AuthResponseData>;
  },

  logout: async (): Promise<ApiResponse<{ message: string }>> => {
    try {
      const res = (await apiClient.post('/auth/logout')) as unknown as ApiResponse<{ message: string }>;
      return res;
    } finally {
      authService.clearSession();
    }
  },

  getMe: async (): Promise<ApiResponse<UserProfile>> => {
    return (await apiClient.get('/auth/me')) as unknown as ApiResponse<UserProfile>;
  },

  createHandoffToken: async (
    productId: string
  ): Promise<ApiResponse<{ productId: string; handoffToken: string; deepLink: string; universalLink: string; expiresInSeconds: number }>> => {
    return (await apiClient.post('/auth/handoff-token', {
      productId,
    })) as unknown as ApiResponse<{ productId: string; handoffToken: string; deepLink: string; universalLink: string; expiresInSeconds: number }>;
  },

  saveSession: (data: AuthResponseData): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('smc_auth_token', data.token);
      localStorage.setItem('smc_user', JSON.stringify(data.user));
    }
  },

  getStoredToken: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('smc_auth_token');
    }
    return null;
  },

  getStoredUser: (): UserProfile | null => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('smc_user');
      if (stored) {
        try {
          return JSON.parse(stored) as UserProfile;
        } catch {
          return null;
        }
      }
    }
    return null;
  },

  clearSession: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('smc_auth_token');
      localStorage.removeItem('smc_user');
    }
  },
};
