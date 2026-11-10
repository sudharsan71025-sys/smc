'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { authService } from '@/services/auth-service';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    // Check if already authenticated and redirect accordingly
    const storedUser = authService.getStoredUser();
    const storedToken = authService.getStoredToken();
    if (storedUser && storedToken) {
      if (storedUser.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    }

    // Pre-warm backend on page load to eliminate Render cold start delays
    const warmUpBackend = async () => {
      try {
        const { getApiBaseUrl } = await import('@/lib/api-url');
        fetch(`${getApiBaseUrl()}/health`, { mode: 'cors' }).catch(() => {});
      } catch {
        // Silently ignore pre-warm errors
      }
    };
    warmUpBackend();
  }, [router]);

  const validate = (): boolean => {
    const errors: { [key: string]: string } = {};
    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = 'Please provide a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.login({
        email: email.trim(),
        password,
      });

      if (response.success && response.data) {
        authService.saveSession(response.data);

        // Role-based redirection
        if (response.data.user.role === 'admin') {
          router.push('/admin');
        } else {
          router.push('/dashboard');
        }
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (err: unknown) {
      const customErr = err as { message?: string; errors?: Array<{ path?: string; message: string }> };
      if (customErr.errors && customErr.errors.length > 0) {
        const fieldErrors: { [key: string]: string } = {};
        customErr.errors.forEach((e) => {
          if (e.path) fieldErrors[e.path] = e.message;
        });
        setValidationErrors(fieldErrors);
      }
      setErrorMessage(customErr.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 sm:px-6 py-8 sm:py-16">
      <Card className="w-full max-w-md border-border p-3 sm:p-6 shadow-sm bg-white">
        <CardHeader className="text-center space-y-2 p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl font-light tracking-tight">
            Account <span className="font-semibold text-primary">Login</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Enter your credentials to access the 3D & AR collection
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {errorMessage && (
              <div className="border border-red-200 bg-red-50/50 p-3 text-xs text-red-600">
                {errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="architect@studio.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationErrors.email) {
                    setValidationErrors((prev) => ({ ...prev, email: '' }));
                  }
                }}
                autoComplete="email"
                required
              />
              {validationErrors.email && (
                <p className="text-[11px] text-red-500 mt-1">{validationErrors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationErrors.password) {
                    setValidationErrors((prev) => ({ ...prev, password: '' }));
                  }
                }}
                autoComplete="current-password"
                required
              />
              {validationErrors.password && (
                <p className="text-[11px] text-red-500 mt-1">{validationErrors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full tracking-wider uppercase text-xs font-semibold mt-2"
              disabled={isLoading}
            >
              {isLoading ? 'Verifying Credentials...' : 'Login'}
            </Button>

            <div className="text-center pt-4 border-t border-border">
              <p className="text-xs text-secondary">
                Do not have an account?{' '}
                <Link
                  href="/register"
                  className="font-medium text-foreground hover:text-primary transition-colors underline underline-offset-4"
                >
                  Create Account
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
