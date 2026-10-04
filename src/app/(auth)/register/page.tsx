'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

function RegisterForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Client-side validations
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Please provide your full name.');
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Failed to create account.');
        setLoading(false);
        return;
      }

      // Successful registration sets session cookie -> Navigate directly to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Unable to connect to the authentication server. Please try again.');
      setLoading(false);
    }
  };

  const isLengthValid = password.length >= 8;
  const isMatchValid = password.length > 0 && password === confirmPassword;

  return (
    <div className="brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-8 shadow-xl shadow-slate-200/40 dark:shadow-none">
      {/* Brand Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Logo size="lg" href="/" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Create an account
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Start tracking your fixed deposits and calculating yields today
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Full Name
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
              <User className="h-4 w-4" />
            </div>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Mercer"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/20 transition-all"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Email Address
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
              <Mail className="h-4 w-4" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/20 transition-all"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Password
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
              <Lock className="h-4 w-4" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Confirm Password
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
              <Lock className="h-4 w-4" />
            </div>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/20 transition-all"
            />
          </div>
        </div>

        {/* Validation Micro-Hints */}
        <div className="space-y-1.5 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2
              className={`h-3.5 w-3.5 ${
                isLengthValid
                  ? 'text-brand-emerald-600 dark:text-brand-emerald-400'
                  : 'text-slate-400 dark:text-slate-600'
              }`}
            />
            <span>Minimum 8 characters</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2
              className={`h-3.5 w-3.5 ${
                isMatchValid
                  ? 'text-brand-emerald-600 dark:text-brand-emerald-400'
                  : 'text-slate-400 dark:text-slate-600'
              }`}
            />
            <span>Passwords match</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-brand-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-emerald-700 dark:bg-brand-emerald-600 dark:hover:bg-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            <>
              <span>Create Account</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer Link to Login */}
      <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-semibold text-brand-emerald-600 hover:text-brand-emerald-500 dark:text-brand-emerald-400 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="brand-glass rounded-2xl p-8 flex items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-brand-emerald-600" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
