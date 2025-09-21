# Next.js Frontend Authentication Implementation Guide

## Overview

This guide provides a comprehensive implementation strategy for integrating the AlmaSync JOSE-based authentication system with your Next.js frontend. The implementation covers authentication flows, state management, middleware protection, and API integration patterns.

## Table of Contents

1. [Project Setup & Dependencies](#project-setup--dependencies)
2. [Authentication Context & State Management](#authentication-context--state-management)
3. [API Client Configuration](#api-client-configuration)
4. [Authentication Service](#authentication-service)
5. [Next.js Middleware Implementation](#nextjs-middleware-implementation)
6. [Authentication Components](#authentication-components)
7. [Protected Routes & Layout](#protected-routes--layout)
8. [Error Handling & User Feedback](#error-handling--user-feedback)
9. [Token Management & Auto-refresh](#token-management--auto-refresh)
10. [Role-based Access Control](#role-based-access-control)
11. [Best Practices & Security](#best-practices--security)

## Project Setup & Dependencies

### Required Dependencies

```bash
npm install axios js-cookie zustand react-hook-form @hookform/resolvers zod
npm install @tanstack/react-query # For advanced data fetching
npm install sonner # For toast notifications (already installed)
```

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

## Authentication Context & State Management

### 1. Create Authentication Store with Zustand

Create `src/store/authStore.js`:

```javascript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      isAuthenticated: false,
      isLoading: false,
      sessionId: null,
      tokens: {
        accessToken: null,
        refreshToken: null,
        tokenType: 'Bearer',
        expiresIn: null,
      },
      
      // Actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      setTokens: (tokens, sessionId = null) => set({ 
        tokens, 
        sessionId,
        isAuthenticated: true 
      }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      logout: () => set({
        user: null,
        isAuthenticated: false,
        sessionId: null,
        tokens: {
          accessToken: null,
          refreshToken: null,
          tokenType: 'Bearer',
          expiresIn: null,
        },
      }),
      
      updateUser: (userData) => set((state) => ({
        user: { ...state.user, ...userData }
      })),
      
      // Computed values
      getAuthHeader: () => {
        const { tokens } = get();
        return tokens.accessToken 
          ? `${tokens.tokenType} ${tokens.accessToken}` 
          : null;
      },
      
      isTokenExpired: () => {
        const { tokens } = get();
        if (!tokens.accessToken) return true;
        
        try {
          const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
          return Date.now() >= payload.exp * 1000;
        } catch {
          return true;
        }
      },
    }),
    {
      name: 'almasync-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        sessionId: state.sessionId,
        // Don't persist tokens for security
      }),
    }
  )
);

export default useAuthStore;
```

### 2. Authentication Context Provider

Create `src/contexts/AuthContext.jsx`:

```javascript
'use client';

import React, { createContext, useContext, useEffect } from 'react';
import useAuthStore from '@/store/authStore';
import { authService } from '@/services/authService';
import { toast } from 'sonner';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    sessionId,
    setUser,
    setTokens,
    setLoading,
    logout,
    isTokenExpired,
  } = useAuthStore();

  // Initialize authentication state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      
      try {
        // Check if user has valid session
        if (isAuthenticated && !isTokenExpired()) {
          // Verify token is still valid with backend
          const userData = await authService.getCurrentUser();
          setUser(userData);
        } else if (isAuthenticated) {
          // Try to refresh tokens
          try {
            await authService.refreshToken();
          } catch (error) {
            // Refresh failed, logout user
            logout();
            toast.error('Session expired. Please login again.');
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        logout();
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Auto-refresh tokens before expiry
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkTokenExpiry = () => {
      if (isTokenExpired()) {
        authService.refreshToken().catch(() => {
          logout();
          toast.error('Session expired. Please login again.');
        });
      }
    };

    // Check every 5 minutes
    const interval = setInterval(checkTokenExpiry, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const contextValue = {
    user,
    isAuthenticated,
    isLoading,
    sessionId,
    login: authService.login,
    register: authService.register,
    logout: authService.logout,
    refreshToken: authService.refreshToken,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

## API Client Configuration

### Create Axios Instance with Interceptors

Create `src/lib/api.js`:

```javascript
import axios from 'axios';
import useAuthStore from '@/store/authStore';
import { toast } from 'sonner';

// Create axios instance
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  timeout: 10000,
  withCredentials: true, // Important for cookies
});

// Request interceptor to add auth headers
api.interceptors.request.use(
  (config) => {
    const { getAuthHeader, sessionId } = useAuthStore.getState();
    
    // Add authorization header
    const authHeader = getAuthHeader();
    if (authHeader) {
      config.headers.Authorization = authHeader;
    }
    
    // Add session ID header
    if (sessionId) {
      config.headers['X-Session-Id'] = sessionId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { logout, isTokenExpired } = useAuthStore.getState();
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // If token is expired, try to refresh
      if (isTokenExpired()) {
        try {
          await refreshTokens();
          
          // Retry original request with new token
          const { getAuthHeader } = useAuthStore.getState();
          originalRequest.headers.Authorization = getAuthHeader();
          
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, logout user
          logout();
          toast.error('Session expired. Please login again.');
          
          // Redirect to login if not already there
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
          
          return Promise.reject(refreshError);
        }
      }
    }
    
    // Handle other errors
    const message = error.response?.data?.message || 'An error occurred';
    
    // Don't show toast for certain errors
    const silentErrors = [401, 403];
    if (!silentErrors.includes(error.response?.status)) {
      toast.error(message);
    }
    
    return Promise.reject(error);
  }
);

// Helper function to refresh tokens
const refreshTokens = async () => {
  try {
    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/refresh-token`,
      {},
      { withCredentials: true }
    );
    
    const { tokens } = response.data.data;
    const { setTokens } = useAuthStore.getState();
    setTokens(tokens);
    
    return tokens;
  } catch (error) {
    throw error;
  }
};

export default api;
```

## Authentication Service

### Create Authentication Service

Create `src/services/authService.js`:

```javascript
import api from '@/lib/api';
import useAuthStore from '@/store/authStore';
import { toast } from 'sonner';

export const authService = {
  // Register new user
  register: async (userData) => {
    try {
      const response = await api.post('/auth/signup', userData);
      
      toast.success(response.data.message);
      return response.data.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      toast.error(message);
      throw error;
    }
  },

  // Login user
  login: async (credentials) => {
    const { setUser, setTokens, setLoading } = useAuthStore.getState();
    
    try {
      setLoading(true);
      
      const response = await api.post('/auth/login', credentials);
      const { user, tokens, sessionId } = response.data.data;
      
      // Update store
      setUser(user);
      setTokens(tokens, sessionId);
      
      toast.success(response.data.message);
      return { user, tokens, sessionId };
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  },

  // Logout user
  logout: async () => {
    const { logout, sessionId } = useAuthStore.getState();
    
    try {
      await api.post('/auth/logout', { sessionId });
      toast.success('Logged out successfully');
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout error:', error);
    } finally {
      logout();
      
      // Redirect to login page
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  },

  // Refresh access token
  refreshToken: async () => {
    const { setTokens, sessionId } = useAuthStore.getState();
    
    try {
      const response = await api.post('/auth/refresh-token', { sessionId });
      const { tokens } = response.data.data;
      
      setTokens(tokens, sessionId);
      return tokens;
    } catch (error) {
      throw error;
    }
  },

  // Get current user data
  getCurrentUser: async () => {
    try {
      const response = await api.get('/user/profile');
      return response.data.data.user;
    } catch (error) {
      throw error;
    }
  },

  // Change password
  changePassword: async (passwordData) => {
    try {
      const response = await api.post('/auth/change-password', passwordData);
      toast.success(response.data.message);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Password change failed';
      toast.error(message);
      throw error;
    }
  },

  // Forgot password
  forgotPassword: async (email) => {
    try {
      const response = await api.get(`/auth/forgot-password/${email}`);
      toast.success(response.data.message);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to send reset email';
      toast.error(message);
      throw error;
    }
  },

  // Reset password with OTP
  resetPassword: async (email, otp, newPassword) => {
    try {
      const response = await api.post(`/auth/forgot-password/${email}/otp-change-password/${otp}`, {
        newPassword
      });
      toast.success(response.data.message);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Password reset failed';
      toast.error(message);
      throw error;
    }
  },
};
```

## Next.js Middleware Implementation

### Create Middleware for Route Protection

Update `src/middleware.js`:

```javascript
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Define route patterns
const publicRoutes = ['/login', '/register', '/forgot-password', '/', '/about'];
const authRoutes = ['/login', '/register'];
const protectedRoutes = ['/profile', '/feed', '/messaging', '/notifications'];
const adminRoutes = ['/admin'];

// JWT secrets (should match backend)
const ACCESS_TOKEN_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_TOKEN_SECRET || 'fallback-secret'
);

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('accessToken')?.value;
  
  // Get user data from token
  let user = null;
  let isValidToken = false;
  
  if (accessToken) {
    try {
      const { payload } = await jwtVerify(accessToken, ACCESS_TOKEN_SECRET, {
        issuer: 'almasync-backend',
        audience: 'almasync-frontend',
      });
      
      user = payload;
      isValidToken = true;
      
      // Check if token is not expired
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        isValidToken = false;
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      isValidToken = false;
    }
  }
  
  // Handle admin routes
  if (pathname.startsWith('/admin')) {
    if (!isValidToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    
    if (user?.role !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
    
    return NextResponse.next();
  }
  
  // Redirect authenticated users away from auth pages
  if (authRoutes.includes(pathname)) {
    if (isValidToken) {
      const redirectTo = request.nextUrl.searchParams.get('redirect') || '/feed';
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
    return NextResponse.next();
  }
  
  // Protect authenticated routes
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!isValidToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    
    // Add user data to headers for SSR
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-data', JSON.stringify(user));
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }
  
  // Allow access to public routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

## Authentication Components

### 1. Login Component

Update `src/app/(auth)/login/page.jsx`:

```javascript
'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import Link from 'next/link';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(false),
});

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/feed';
  
  const { login, isLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      await login(data);
      router.push(redirectTo);
    } catch (error) {
      // Error handling is done in the auth service
      console.error('Login failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Enter your email"
                        {...field}
                        disabled={isSubmitting || isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        {...field}
                        disabled={isSubmitting || isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting || isLoading}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm font-normal">
                        Remember me for 30 days
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full"
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </Form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-gray-600">
                Don't have an account?{' '}
                <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                  Sign up
                </Link>
              </p>
              <p className="text-sm">
                <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
                  Forgot your password?
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 2. Protected Route Component

Create `src/components/ProtectedRoute.jsx`:

```javascript
'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const ProtectedRoute = ({ children, requiredRole = null, fallback = null }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return fallback || null;
  }

  // Check role if required
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
```

### 3. Auth Guard Hook

Create `src/hooks/useAuthGuard.js`:

```javascript
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const useAuthGuard = (options = {}) => {
  const { 
    requiredRole = null, 
    redirectTo = '/login',
    requireAuth = true 
  } = options;
  
  const { isAuthenticated, user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Check authentication requirement
    if (requireAuth && !isAuthenticated) {
      router.push(redirectTo);
      return;
    }

    // Check role requirement
    if (requiredRole && user?.role !== requiredRole) {
      router.push('/unauthorized');
      return;
    }

    // Redirect authenticated users from auth pages
    if (!requireAuth && isAuthenticated) {
      router.push('/feed');
      return;
    }
  }, [isAuthenticated, user, isLoading, requiredRole, redirectTo, requireAuth, router]);

  return {
    isAuthenticated,
    user,
    isLoading,
    hasRequiredRole: !requiredRole || user?.role === requiredRole,
  };
};
```

## Protected Routes & Layout

### 1. Main Layout with Auth

Update `src/app/layout.jsx`:

```javascript
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'AlmaSync',
  description: 'Connect with your alumni network',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
```

### 2. Dashboard Layout

Create `src/app/(dashboard)/layout.jsx`:

```javascript
'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

### 3. Navbar Component with Auth

Update `src/components/Navbar.jsx`:

```javascript
'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  if (!isAuthenticated) {
    return (
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-xl font-bold text-blue-600">
              AlmaSync
            </Link>
            <div className="flex space-x-4">
              <Link href="/login">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button>Sign up</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/feed" className="text-xl font-bold text-blue-600">
            AlmaSync
          </Link>

          <div className="flex items-center space-x-6">
            <nav className="hidden md:flex space-x-6">
              <Link href="/feed" className="text-gray-600 hover:text-gray-900">
                Feed
              </Link>
              <Link href="/alumni-directory" className="text-gray-600 hover:text-gray-900">
                Alumni
              </Link>
              <Link href="/job-portal" className="text-gray-600 hover:text-gray-900">
                Jobs
              </Link>
              <Link href="/messaging" className="text-gray-600 hover:text-gray-900">
                Messages
              </Link>
            </nav>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profilePicture} alt={user?.firstName} />
                    <AvatarFallback>
                      {getInitials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile/settings">Settings</Link>
                </DropdownMenuItem>
                {user?.role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">Admin Panel</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
```

## Error Handling & User Feedback

### 1. Error Boundary Component

Create `src/components/ErrorBoundary.jsx`:

```javascript
'use client';

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Auth Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Something went wrong
            </h2>
            <p className="text-gray-600 mb-6">
              We're sorry, but something unexpected happened.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

### 2. Loading States Component

Create `src/components/LoadingStates.jsx`:

```javascript
import React from 'react';

export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]} ${className}`} />
  );
};

export const LoadingPage = ({ message = 'Loading...' }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <LoadingSpinner size="lg" className="mx-auto mb-4" />
      <p className="text-gray-600">{message}</p>
    </div>
  </div>
);

export const LoadingButton = ({ isLoading, children, ...props }) => (
  <button {...props} disabled={isLoading || props.disabled}>
    {isLoading ? (
      <span className="flex items-center justify-center">
        <LoadingSpinner size="sm" className="mr-2" />
        Loading...
      </span>
    ) : (
      children
    )}
  </button>
);
```

## Token Management & Auto-refresh

### 1. Token Refresh Hook

Create `src/hooks/useTokenRefresh.js`:

```javascript
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import useAuthStore from '@/store/authStore';

export const useTokenRefresh = () => {
  const { refreshToken } = useAuth();
  const { isTokenExpired, isAuthenticated } = useAuthStore();
  const refreshTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const scheduleRefresh = () => {
      // Clear existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      // Calculate time until token expires (refresh 2 minutes before)
      const timeUntilRefresh = getTimeUntilRefresh();
      
      if (timeUntilRefresh > 0) {
        refreshTimeoutRef.current = setTimeout(async () => {
          try {
            await refreshToken();
            scheduleRefresh(); // Schedule next refresh
          } catch (error) {
            console.error('Token refresh failed:', error);
          }
        }, timeUntilRefresh);
      }
    };

    const getTimeUntilRefresh = () => {
      const { tokens } = useAuthStore.getState();
      if (!tokens.accessToken) return 0;

      try {
        const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
        const expiryTime = payload.exp * 1000;
        const refreshTime = expiryTime - (2 * 60 * 1000); // 2 minutes before expiry
        return Math.max(0, refreshTime - Date.now());
      } catch {
        return 0;
      }
    };

    scheduleRefresh();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [isAuthenticated, refreshToken]);
};
```

### 2. API Hook with Auto-retry

Create `src/hooks/useApi.js`:

```javascript
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export const useApi = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();

  const {
    method = 'GET',
    body = null,
    dependencies = [],
    skip = false,
  } = options;

  useEffect(() => {
    if (skip) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const config = {
          method,
          url,
        };

        if (body) {
          config.data = body;
        }

        const response = await api(config);
        setData(response.data);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url, method, JSON.stringify(body), isAuthenticated, ...dependencies]);

  const refetch = () => {
    setLoading(true);
    setError(null);
  };

  return { data, error, loading, refetch };
};
```

## Role-based Access Control

### 1. Role-based Route Protection

Create `src/components/RoleGuard.jsx`:

```javascript
'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

const RoleGuard = ({ 
  children, 
  allowedRoles = [], 
  fallback = null, 
  requireAll = false 
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return fallback || <div>Access denied: Please log in</div>;
  }

  const userRole = user?.role;
  
  // Check if user has required role(s)
  const hasAccess = requireAll 
    ? allowedRoles.every(role => userRole === role)
    : allowedRoles.includes(userRole);

  if (!hasAccess) {
    return fallback || (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-gray-600 mt-2">
          You don't have permission to view this content.
        </p>
      </div>
    );
  }

  return children;
};

export default RoleGuard;
```

### 2. Role-based Component Rendering

Create `src/hooks/useRole.js`:

```javascript
import { useAuth } from '@/contexts/AuthContext';

export const useRole = () => {
  const { user, isAuthenticated } = useAuth();

  const hasRole = (role) => {
    return isAuthenticated && user?.role === role;
  };

  const hasAnyRole = (roles) => {
    return isAuthenticated && roles.includes(user?.role);
  };

  const isStudent = () => hasRole('student');
  const isAlumni = () => hasRole('alumni');
  const isAdmin = () => hasRole('admin');

  return {
    role: user?.role,
    hasRole,
    hasAnyRole,
    isStudent,
    isAlumni,
    isAdmin,
    isAuthenticated,
  };
};
```

## Best Practices & Security

### 1. Security Best Practices

```javascript
// src/utils/security.js

export const securityUtils = {
  // Sanitize user input
  sanitizeInput: (input) => {
    if (typeof input !== 'string') return input;
    return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  },

  // Validate token structure
  isValidJWT: (token) => {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3;
  },

  // Check if user can access resource
  canAccess: (user, resource, permission = 'read') => {
    if (!user || !resource) return false;
    
    // Admin can access everything
    if (user.role === 'admin') return true;
    
    // Resource-specific access logic
    switch (resource.type) {
      case 'profile':
        return resource.userId === user._id || permission === 'read';
      case 'message':
        return resource.participants.includes(user._id);
      default:
        return false;
    }
  },

  // Rate limiting for client-side
  createRateLimiter: (maxRequests, windowMs) => {
    const requests = new Map();
    
    return (key) => {
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requests.has(key)) {
        requests.set(key, []);
      }
      
      const userRequests = requests.get(key);
      const validRequests = userRequests.filter(time => time > windowStart);
      
      if (validRequests.length >= maxRequests) {
        return false;
      }
      
      validRequests.push(now);
      requests.set(key, validRequests);
      return true;
    };
  },
};
```

### 2. Environment Configuration

```javascript
// src/config/auth.js

export const authConfig = {
  // Token settings
  tokenRefreshBuffer: 2 * 60 * 1000, // 2 minutes before expiry
  maxRetries: 3,
  retryDelay: 1000,
  
  // Session settings
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  maxSessions: 5,
  
  // Security settings
  requireHttps: process.env.NODE_ENV === 'production',
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  
  // API settings
  apiTimeout: 10000,
  apiRetries: 3,
};
```

### 3. Performance Optimizations

```javascript
// src/hooks/useAuthOptimized.js

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const useAuthOptimized = () => {
  const auth = useAuth();
  
  // Memoize computed values
  const authState = useMemo(() => ({
    isAuthenticated: auth.isAuthenticated,
    user: auth.user,
    userRole: auth.user?.role,
    isAdmin: auth.user?.role === 'admin',
    isStudent: auth.user?.role === 'student',
    isAlumni: auth.user?.role === 'alumni',
    fullName: auth.user ? `${auth.user.firstName} ${auth.user.lastName}` : '',
    initials: auth.user ? `${auth.user.firstName?.[0] || ''}${auth.user.lastName?.[0] || ''}` : '',
  }), [auth.user, auth.isAuthenticated]);

  return {
    ...auth,
    ...authState,
  };
};
```

## Implementation Checklist

### Phase 1: Setup & Core Authentication
- [ ] Install required dependencies
- [ ] Set up environment variables
- [ ] Create authentication store with Zustand
- [ ] Implement authentication context
- [ ] Configure Axios with interceptors
- [ ] Create authentication service
- [ ] Implement login/register components

### Phase 2: Route Protection & Middleware
- [ ] Implement Next.js middleware for route protection
- [ ] Create protected route components
- [ ] Set up role-based access control
- [ ] Implement authentication guards

### Phase 3: User Experience & Feedback
- [ ] Add loading states and error handling
- [ ] Implement toast notifications
- [ ] Create user-friendly error pages
- [ ] Add form validation and feedback

### Phase 4: Advanced Features
- [ ] Implement automatic token refresh
- [ ] Add session management
- [ ] Create admin dashboard protection
- [ ] Implement role-based component rendering

### Phase 5: Security & Optimization
- [ ] Add security utilities
- [ ] Implement rate limiting
- [ ] Add performance optimizations
- [ ] Test authentication flows

This implementation guide provides a complete authentication and authorization system for your Next.js frontend that seamlessly integrates with your AlmaSync backend. The system is scalable, secure, and provides excellent user experience with proper error handling and loading states.
