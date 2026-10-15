import { envConfig } from '../config/env.config';

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'STUDENT' | 'FACULTY' | 'ADMIN';
  department: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data?.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }
  return data as T;
};

export const authApi = {
  register: async (payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    department?: string;
  }): Promise<ApiResponse<{ user: UserProfile }>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResponse<ApiResponse<{ user: UserProfile }>>(res);
  },

  login: async (payload: {
    email: string;
    password: string;
  }): Promise<ApiResponse<{ user: UserProfile }>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResponse<ApiResponse<{ user: UserProfile }>>(res);
  },

  logout: async (): Promise<ApiResponse> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<ApiResponse>(res);
  },

  getMe: async (): Promise<ApiResponse<{ user: UserProfile }>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/auth/me`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });
    return handleResponse<ApiResponse<{ user: UserProfile }>>(res);
  },

  updateProfile: async (payload: {
    firstName?: string;
    lastName?: string;
    department?: string;
  }): Promise<ApiResponse<{ user: UserProfile }>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResponse<ApiResponse<{ user: UserProfile }>>(res);
  },

  changePassword: async (payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ApiResponse> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/users/me/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResponse<ApiResponse>(res);
  },
};
