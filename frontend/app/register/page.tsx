'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { authService } from '@/services/auth-service';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    // If already logged in, redirect
    const storedUser = authService.getStoredUser();
    const storedToken = authService.getStoredToken();
    if (storedUser && storedToken) {
      if (storedUser.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    }
  }, [router]);

  const validate = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!name.trim()) {
      errors.name = 'Full name is required.';
    } else if (name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = 'Please provide a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm password is required.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
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
      const response = await authService.register({
        name: name.trim(),
        email: email.trim(),
        password,
        confirmPassword,
      });

      if (response.success && response.data) {
        authService.saveSession(response.data);
        // Standard registered users are always redirected to the User Dashboard
        router.push('/dashboard');
      } else {
        throw new Error(response.message || 'Registration failed');
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
      setErrorMessage(customErr.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 sm:px-6 py-8 sm:py-16">
      <Card className="w-full max-w-md border-border p-3 sm:p-6 shadow-sm bg-white">
        <CardHeader className="text-center space-y-2 p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl font-light tracking-tight">
            Create <span className="font-semibold text-primary">Account</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Register to explore and experience 3D doors & windows in AR
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {errorMessage && (
              <div className="border border-red-200 bg-red-50/50 p-3 text-xs text-red-600">
                {errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Jane Architect"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationErrors.name) {
                    setValidationErrors((prev) => ({ ...prev, name: '' }));
                  }
                }}
                autoComplete="name"
                required
              />
              {validationErrors.name && (
                <p className="text-[11px] text-red-500 mt-1">{validationErrors.name}</p>
              )}
            </div>

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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationErrors.password) {
                    setValidationErrors((prev) => ({ ...prev, password: '' }));
                  }
                }}
                autoComplete="new-password"
                required
              />
              {validationErrors.password && (
                <p className="text-[11px] text-red-500 mt-1">{validationErrors.password}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (validationErrors.confirmPassword) {
                    setValidationErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }
                }}
                autoComplete="new-password"
                required
              />
              {validationErrors.confirmPassword && (
                <p className="text-[11px] text-red-500 mt-1">{validationErrors.confirmPassword}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full tracking-wider uppercase text-xs font-semibold mt-2"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>

            <div className="text-center pt-4 border-t border-border">
              <p className="text-xs text-secondary">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="font-medium text-foreground hover:text-primary transition-colors underline underline-offset-4"
                >
                  Log In
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
