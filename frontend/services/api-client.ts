import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiResponse, ApiErrorResponse } from '@/types/api';
import { getApiBaseUrl } from '@/lib/api-url';

export const apiClient = axios.create({
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to attach JWT auth token and set dynamic API host
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.baseURL = getApiBaseUrl();
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('smc_auth_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for unified response handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiErrorResponse>) => {
    let message = error.response?.data?.message || error.message || 'An unexpected error occurred';
    
    // Friendly clarification for Render free-tier cold start delays
    if (error.code === 'ECONNABORTED' || message.includes('timeout') || message.includes('Network Error')) {
      message = 'The cloud server took longer than expected to respond (waking up from standby). Please try again.';
    }

    const customError = {
      message,
      statusCode: error.response?.status || 500,
      errors: error.response?.data?.errors,
    };
    return Promise.reject(customError);
  }
);

